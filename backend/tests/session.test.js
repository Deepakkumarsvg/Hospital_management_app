// Sessions have to be revocable.
//
// The old scheme issued one long-lived JWT and nothing else: logging out only
// discarded it client-side, so a stolen token kept working until it expired on
// its own and there was no way to end a session from the server. These tests
// pin down the replacement — a short access token plus a rotating, revocable
// refresh session.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, connectTestDb, disconnectTestDb, inTenant, seedBase, auth } from './helpers.js';

const { Session, hashRefreshToken } = await import('../src/models/Session.js');
const { User } = await import('../src/models/User.js');

const CREDS = { email: 'recep@test.local', password: 'Recep@123' };
const COOKIE = 'hms_rt';

beforeAll(async () => {
  await connectTestDb();
  await seedBase();
});

afterAll(async () => { await disconnectTestDb(); });

beforeEach(async () => {
  await inTenant(async () => { await Session.deleteMany({}); });
});

// Pull the refresh cookie value out of a Set-Cookie header.
function refreshCookieFrom(res) {
  const raw = res.headers['set-cookie'] || [];
  const line = raw.find((c) => c.startsWith(`${COOKIE}=`));
  return line ? line.split(';')[0].slice(COOKIE.length + 1) : null;
}

const signIn = () => request(app).post('/api/auth/login').send(CREDS);

const refreshWith = (cookie) =>
  request(app).post('/api/auth/refresh').set('Cookie', `${COOKIE}=${cookie}`);

describe('signing in', () => {
  it('returns an access token and sets an httpOnly refresh cookie', async () => {
    const res = await signIn();
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();

    const line = (res.headers['set-cookie'] || []).find((c) => c.startsWith(`${COOKIE}=`));
    expect(line).toBeTruthy();
    // Page script must not be able to read the long-lived credential.
    expect(line).toMatch(/HttpOnly/i);
    expect(line).toMatch(/Path=\/api\/auth/i);

    // The refresh token itself is never in the JSON body.
    expect(JSON.stringify(res.body)).not.toContain(refreshCookieFrom(res));
  });

  it('stores only a hash of the refresh token', async () => {
    const res = await signIn();
    const raw = refreshCookieFrom(res);

    await inTenant(async () => {
      // The raw value appears nowhere; only its hash does.
      expect(await Session.findOne({ tokenHash: raw })).toBeNull();
      expect(await Session.findOne({ tokenHash: hashRefreshToken(raw) })).toBeTruthy();
    });
  });
});

describe('refreshing', () => {
  it('mints a new access token from the cookie alone', async () => {
    const cookie = refreshCookieFrom(await signIn());

    const res = await refreshWith(cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.email).toBe(CREDS.email);
  });

  it('rotates the refresh token on every use', async () => {
    const first = refreshCookieFrom(await signIn());
    const second = refreshCookieFrom(await refreshWith(first));

    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
  });

  it('refuses a token that has already been rotated away', async () => {
    const first = refreshCookieFrom(await signIn());
    await refreshWith(first); // rotates it

    const replay = await refreshWith(first);
    expect(replay.status).toBe(401);
    expect(replay.body.error).toBe('SESSION_REPLAY');
  });

  it('ends every session when a retired token is replayed', async () => {
    // A replayed refresh token means either theft or a confused client, and
    // the two are indistinguishable — so the safe reading is the hostile one.
    const first = refreshCookieFrom(await signIn());
    const second = refreshCookieFrom(await refreshWith(first));

    await refreshWith(first); // the replay

    // The successor is gone too, not just the token that was replayed.
    const res = await refreshWith(second);
    expect(res.status).toBe(401);
  });

  it('refuses an unknown token', async () => {
    const res = await refreshWith('not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('SESSION_INVALID');
  });

  it('refuses when no cookie is presented at all', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('refuses once the account is deactivated', async () => {
    const cookie = refreshCookieFrom(await signIn());
    await inTenant(async () => {
      await User.updateOne({ email: CREDS.email }, { status: 'INACTIVE' });
    });

    const res = await refreshWith(cookie);
    expect(res.status).toBe(401);

    await inTenant(async () => {
      await User.updateOne({ email: CREDS.email }, { status: 'ACTIVE' });
    });
  });
});

describe('signing out', () => {
  it('revokes the session server-side, not just in the browser', async () => {
    const cookie = refreshCookieFrom(await signIn());

    const out = await request(app).post('/api/auth/logout').set('Cookie', `${COOKIE}=${cookie}`);
    expect(out.status).toBe(200);

    // The whole point: the token is dead even though the client still holds it.
    const res = await refreshWith(cookie);
    expect(res.status).toBe(401);
  });

  it('works even after the access token has expired', async () => {
    // Logout is not authenticate-guarded, precisely so a session can still be
    // ended once its access token is gone.
    const cookie = refreshCookieFrom(await signIn());
    const out = await request(app).post('/api/auth/logout').set('Cookie', `${COOKIE}=${cookie}`);
    expect(out.status).toBe(200);
  });
});

describe('session management', () => {
  it('lists the account’s active sessions without leaking the tokens', async () => {
    const login1 = await signIn();
    await signIn(); // a second device

    const res = await request(app).get('/api/auth/sessions').set(auth(login1.body.data.token));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(JSON.stringify(res.body)).not.toContain('tokenHash');
  });

  it('signs out everywhere on request', async () => {
    const a = refreshCookieFrom(await signIn());
    const login2 = await signIn();
    const b = refreshCookieFrom(login2);

    const res = await request(app).post('/api/auth/sessions/revoke-all')
      .set(auth(login2.body.data.token));
    expect(res.status).toBe(200);
    expect(res.body.data.revoked).toBe(2);

    expect((await refreshWith(a)).status).toBe(401);
    expect((await refreshWith(b)).status).toBe(401);
  });

  it('ends every session when the password is changed', async () => {
    const login = await signIn();
    const cookie = refreshCookieFrom(login);

    const changed = await request(app).post('/api/auth/change-password')
      .set(auth(login.body.data.token))
      .send({ currentPassword: CREDS.password, newPassword: 'Recep@1234' });
    expect(changed.status).toBe(200);

    // A password change is how someone reacts to a suspected compromise; the
    // refresh tokens must not outlive it.
    expect((await refreshWith(cookie)).status).toBe(401);

    // Put it back for the other tests in this file.
    await request(app).post('/api/auth/login').send({ email: CREDS.email, password: 'Recep@1234' })
      .then((r) => request(app).post('/api/auth/change-password')
        .set(auth(r.body.data.token))
        .send({ currentPassword: 'Recep@1234', newPassword: CREDS.password }));
  });
});
