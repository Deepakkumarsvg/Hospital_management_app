// Refresh-token sessions: the revocable half of the auth pair.
//
// An access token is a short-lived JWT that nothing can call back. A session is
// a row, so it can be ended — on logout, on password change, or by an admin
// who needs a compromised account off the system now rather than whenever its
// token happens to expire.
import { Session, hashRefreshToken, newRefreshToken } from '../models/Session.js';
import { ApiError } from '../utils/ApiError.js';

// How long a session lives if it is never used again. Each refresh rotates it,
// so an account in daily use effectively stays signed in; one left alone goes
// cold on its own.
export const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_DAYS || 30);

const expiryFromNow = () => new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

export async function issueSession(userId, { userAgent = '', ip = '' } = {}) {
  const raw = newRefreshToken();
  await Session.create({
    user: userId,
    tokenHash: hashRefreshToken(raw),
    userAgent: String(userAgent).slice(0, 300),
    ip,
    expiresAt: expiryFromNow(),
  });
  return raw;
}

// Exchange a refresh token for a fresh one, retiring the old.
//
// Rotation is what turns a stolen refresh token into a detectable event rather
// than a silent, permanent foothold: the thief and the real user cannot both
// keep using the same token, and whoever presents the retired one is caught by
// the replay check below.
export async function rotateSession(rawToken, { userAgent = '', ip = '' } = {}) {
  const tokenHash = hashRefreshToken(rawToken);
  const session = await Session.findOne({ tokenHash });

  if (!session) throw ApiError.unauthorized('Session not found — please sign in again', 'SESSION_INVALID');

  if (session.revokedAt) {
    // A retired token has been presented. Either it was stolen and is being
    // replayed, or the legitimate client is retrying — and since the two are
    // indistinguishable from here, the safe reading is the hostile one. Every
    // session for this user goes, forcing a real sign-in.
    await revokeAllForUser(session.user, 'refresh token replay');
    throw ApiError.unauthorized('Session was reused — all sessions ended, please sign in again', 'SESSION_REPLAY');
  }

  if (session.expiresAt <= new Date()) {
    throw ApiError.unauthorized('Session expired — please sign in again', 'SESSION_EXPIRED');
  }

  const raw = newRefreshToken();
  const nextHash = hashRefreshToken(raw);

  await Session.create({
    user: session.user,
    tokenHash: nextHash,
    userAgent: String(userAgent).slice(0, 300) || session.userAgent,
    ip: ip || session.ip,
    expiresAt: expiryFromNow(),
  });

  session.revokedAt = new Date();
  session.replacedBy = nextHash;
  await session.save();

  return { raw, userId: session.user };
}

export async function revokeSession(rawToken) {
  if (!rawToken) return { revoked: 0 };
  const res = await Session.updateOne(
    { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  return { revoked: res.modifiedCount || 0 };
}

// End every session a user has. Used on logout-everywhere, on password change,
// and when a replayed token says the account is compromised.
export async function revokeAllForUser(userId, _reason = '') {
  const res = await Session.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  return { revoked: res.modifiedCount || 0 };
}

// The sessions a user can see and end from their own account page.
export async function listSessions(userId) {
  const rows = await Session.find({ user: userId, revokedAt: null, expiresAt: { $gt: new Date() } })
    .sort({ lastUsedAt: -1 })
    .lean();
  // The hash is a credential-equivalent and never leaves the server.
  return rows.map(({ tokenHash: _tokenHash, replacedBy: _replacedBy, ...safe }) => safe);
}

export const touchSession = (rawToken) =>
  Session.updateOne({ tokenHash: hashRefreshToken(rawToken) }, { $set: { lastUsedAt: new Date() } });
