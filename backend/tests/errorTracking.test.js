// Error tracking has one job that everything else depends on: turn many
// occurrences of one bug into one row you can act on.
//
// The two ways it can fail are opposite and equally useless. Group too
// aggressively and two different bugs share a row, so fixing one closes the
// other while it is still breaking. Group too little and a broken endpoint hit
// four hundred times fills the screen with four hundred identical rows, and the
// screen stops being read. These tests pin down where that line sits.
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app, connectTestDb, disconnectTestDb, inTenant, seedBase, login, auth } from './helpers.js';

const { ErrorLog } = await import('../src/models/ErrorLog.js');
const { captureError, captureClientError, fingerprintOf, normaliseRoute } =
  await import('../src/services/errorTracking.js');
const { errorHandler } = await import('../src/middleware/errorHandler.js');
const { ApiError } = await import('../src/utils/ApiError.js');

let token;

beforeAll(async () => {
  await connectTestDb();
  await seedBase();
  token = await login('admin@test.local', 'Admin@123');
});

afterAll(async () => { await disconnectTestDb(); });

beforeEach(async () => {
  await inTenant(() => ErrorLog.deleteMany({}));
});

const groups = (filter = {}) => inTenant(() => ErrorLog.find(filter).lean());

// Errors under test are built by these helpers rather than inline, and that is
// load-bearing rather than tidiness.
//
// A fingerprint includes the frame that threw, so two `new Error()` calls on
// two different lines of this file are two different throw sites — which is
// exactly the distinction the grouping is supposed to make, and would make
// these tests assert the opposite of what they mean. Constructing them at one
// site is what makes "the same bug, twice" actually the same bug.
const castFailure = (id) => new Error(`Cast to ObjectId failed for value "${id}"`);
const boom = (message = 'flaky') => new Error(message);

describe('grouping', () => {
  it('collapses repeats of the same failure into one row with a count', async () => {
    await inTenant(async () => {
      for (let i = 0; i < 3; i += 1) {
        await captureError({ error: new TypeError('x is not a function'), statusCode: 500 });
      }
    });

    const found = await groups();
    expect(found).toHaveLength(1);
    expect(found[0].count).toBe(3);
  });

  it('keeps genuinely different failures apart', async () => {
    await inTenant(async () => {
      await captureError({ error: new TypeError('x is not a function'), statusCode: 500 });
      await captureError({ error: new RangeError('index out of range'), statusCode: 500 });
    });

    expect(await groups()).toHaveLength(2);
  });

  it('groups the same bug hit on different records', async () => {
    // The id in the message is the ONLY difference between these two, and it
    // is the difference that must not matter — otherwise one bad code path
    // produces a new row per patient it touches.
    await inTenant(async () => {
      await captureError({ error: castFailure('66f1c0a2b4e1f70012a4c111'), statusCode: 500 });
      await captureError({ error: castFailure('66f1c0a2b4e1f70012a4c999'), statusCode: 500 });
    });

    const found = await groups();
    expect(found).toHaveLength(1);
    expect(found[0].count).toBe(2);
  });

  it('normalises ids out of the route so one broken endpoint is one row', () => {
    expect(normaliseRoute('/api/patients/66f1c0a2b4e1f70012a4c111/documents'))
      .toBe('/api/patients/:id/documents');
    expect(normaliseRoute('/api/invoices/42')).toBe('/api/invoices/:id');
  });

  it('drops the query string rather than fingerprinting patient search terms', () => {
    expect(normaliseRoute('/api/patients?search=Sunita+Sharma')).toBe('/api/patients');
  });

  it('separates a browser crash from an identical server one', () => {
    const shared = { kind: 'error', name: 'TypeError', message: 'boom', method: 'GET', route: '/x' };
    expect(fingerprintOf({ ...shared, source: 'frontend' }))
      .not.toBe(fingerprintOf({ ...shared, source: 'backend' }));
  });
});

describe('what a group records', () => {
  it('tracks first and last occurrence, not just a timestamp', async () => {
    await inTenant(async () => {
      await captureError({ error: boom(), statusCode: 500 });
      await new Promise((r) => setTimeout(r, 10));
      await captureError({ error: boom(), statusCode: 500 });
    });

    const [g] = await groups();
    expect(new Date(g.lastSeenAt).getTime()).toBeGreaterThan(new Date(g.firstSeenAt).getTime());
  });

  it('caps the samples it keeps so a hot error cannot grow without bound', async () => {
    await inTenant(async () => {
      for (let i = 0; i < 15; i += 1) {
        await captureError({ error: boom('hot'), statusCode: 500 });
      }
    });

    const [g] = await groups();
    expect(g.count).toBe(15);
    expect(g.samples.length).toBeLessThanOrEqual(10);
  });

  it('reopens a resolved error that happens again', async () => {
    // "We fixed that" and "it is still happening" must not both be true on the
    // same row — a fix that did not work would otherwise stay hidden behind
    // the default filter.
    await inTenant(async () => {
      await captureError({ error: boom('thought this was fixed'), statusCode: 500 });
      await ErrorLog.updateOne({}, { $set: { resolved: true, resolvedBy: 'Admin' } });
      await captureError({ error: boom('thought this was fixed'), statusCode: 500 });
    });

    const [g] = await groups();
    expect(g.resolved).toBe(false);
    expect(g.count).toBe(2);
  });
});

describe('the wiring into the request pipeline', () => {
  // The capture is triggered from the central error handler, so that is what
  // is exercised here — driven directly rather than through supertest, because
  // every route in this app is written NOT to 500 and provoking a genuine one
  // would mean testing a bug instead of the reporting.
  const fakeRes = () => {
    const res = { statusCode: 0, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    return res;
  };

  const fakeReq = (overrides = {}) => ({
    method: 'GET',
    originalUrl: '/api/patients/66f1c0a2b4e1f70012a4c111/documents',
    ip: '10.0.0.7',
    id: 'req-abc-123',
    headers: { 'user-agent': 'Mozilla/5.0' },
    ...overrides,
  });

  it('records a 5xx, with the route normalised and the request id kept', async () => {
    await inTenant(() => {
      errorHandler(boom('reading property of undefined'), fakeReq(), fakeRes(), () => {});
    });

    // The capture is deliberately fire-and-forget, so the response is not
    // waiting on it — which means the test has to.
    await vi.waitFor(async () => expect(await groups({ kind: 'error' })).toHaveLength(1));

    const [g] = await groups({ kind: 'error' });
    // The patient id must not split one broken endpoint into one row per
    // record it was called on.
    expect(g.route).toBe('/api/patients/:id/documents');
    expect(g.statusCode).toBe(500);
    // Correlates the group back to the pino log line for the same request.
    expect(g.samples[0].requestId).toBe('req-abc-123');
  });

  it('ignores 4xx — a rejected password is the system working', async () => {
    await inTenant(() => {
      errorHandler(ApiError.notFound('Patient not found'), fakeReq(), fakeRes(), () => {});
      errorHandler(ApiError.unauthorized('Wrong password'), fakeReq(), fakeRes(), () => {});
    });

    // And the same again through the real stack, end to end.
    await request(app).post('/api/auth/login').send({ email: 'nobody@test.local', password: 'wrong' });
    await request(app).get('/api/does-not-exist');

    expect(await groups()).toHaveLength(0);
  });
});

describe('browser reports', () => {
  const payload = {
    name: 'TypeError',
    message: "Cannot read properties of undefined (reading 'name')",
    stack: "TypeError: Cannot read properties of undefined\n    at PatientCard (/assets/index-a1b2.js:441:12)",
    url: '/patients/66f1c0a2b4e1f70012a4c111',
    userAgent: 'Mozilla/5.0 (Macintosh)',
  };

  it('accepts a crash from a signed-out browser', async () => {
    // The crash on the login screen is the one most worth having, and
    // requiring a session would drop every one of them.
    const res = await request(app).post('/api/errors/report').send(payload);

    expect(res.status).toBe(202);
    const found = await groups({ source: 'frontend' });
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe('TypeError');
    // The patient id in the URL must not split one component's bug into one
    // group per record it was opened on.
    expect(found[0].route).toBe('/patients/:id');
  });

  it('rejects a report with no message rather than storing a blank row', async () => {
    const res = await request(app).post('/api/errors/report').send({ stack: 'nope' });
    expect(res.status).toBe(400);
  });

  it('truncates an oversized payload instead of trusting it', async () => {
    const res = await request(app)
      .post('/api/errors/report')
      .send({ ...payload, message: 'x'.repeat(50_000) });

    // Bounded by the schema, so it is refused outright rather than stored.
    expect(res.status).toBe(400);
    expect(await groups()).toHaveLength(0);
  });

  it('does not blow up on a report with no tenant context', async () => {
    // Captured outside a request there is no tenant DB to write to. It must
    // return quietly, not throw into whatever was being handled.
    await expect(captureClientError(payload, null)).resolves.toBeNull();
  });
});

describe('access', () => {
  it('refuses the triage list without a session', async () => {
    const res = await request(app).get('/api/errors');
    expect(res.status).toBe(401);
  });

  it('refuses it to a role without errors:view', async () => {
    const recepToken = await login('recep@test.local', 'Recep@123');
    const res = await request(app).get('/api/errors').set(auth(recepToken));
    expect(res.status).toBe(403);
  });

  it('serves it to an admin', async () => {
    const res = await request(app).get('/api/errors').set(auth(token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('does not leak stacks into the list payload', async () => {
    // The list is a triage view; stacks load with the detail. Sending them to
    // every list request is bandwidth nobody asked for and a bigger blast
    // radius than the screen needs.
    await inTenant(() => captureError({ error: boom('has a stack'), statusCode: 500 }));

    const res = await request(app).get('/api/errors').set(auth(token));
    expect(res.body.data[0].stack).toBeUndefined();
    expect(res.body.data[0].samples).toBeUndefined();
  });
});

describe('triage', () => {
  it('marks a group resolved and hides it from the default list', async () => {
    await inTenant(() => captureError({ error: boom('to be fixed'), statusCode: 500 }));
    const [g] = await groups();

    const res = await request(app)
      .patch(`/api/errors/${g._id}/resolve`)
      .set(auth(token))
      .send({ resolved: true });

    expect(res.status).toBe(200);
    expect(res.body.data.resolved).toBe(true);

    const list = await request(app).get('/api/errors').set(auth(token));
    expect(list.body.data).toHaveLength(0);

    const all = await request(app).get('/api/errors?status=all').set(auth(token));
    expect(all.body.data).toHaveLength(1);
  });
});

describe('the numbers on the header', () => {
  it('counts distinct people, not occurrences', async () => {
    // Two accounts hitting the same bug twenty times is two people, not
    // twenty — that distinction is what decides how urgent it is.
    const req = (id) => ({ method: 'GET', originalUrl: '/api/x', headers: {}, user: { _id: id, name: 'U', role: 'NURSE' } });
    await inTenant(async () => {
      for (let i = 0; i < 5; i += 1) await captureError({ error: boom('wide'), req: req('user-a'), statusCode: 500 });
      for (let i = 0; i < 5; i += 1) await captureError({ error: boom('wide'), req: req('user-b'), statusCode: 500 });
    });

    const res = await request(app).get('/api/errors/stats').set(auth(token));
    expect(res.body.data.occurrences).toBe(10);
    expect(res.body.data.affectedUsers).toBe(2);
  });

  it('reports today against yesterday, so the number means something', async () => {
    await inTenant(() => captureError({ error: boom('today'), statusCode: 500 }));

    const res = await request(app).get('/api/errors/stats').set(auth(token));
    expect(res.body.data.newToday).toBe(1);
    // Nothing was backdated, so yesterday is genuinely zero rather than absent.
    expect(res.body.data.newYesterday).toBe(0);
  });

  it('counts regressions separately from new bugs', async () => {
    await inTenant(async () => {
      await captureError({ error: boom('came back'), statusCode: 500 });
      await ErrorLog.updateOne({}, { $set: { resolved: true } });
      await captureError({ error: boom('came back'), statusCode: 500 });
    });

    const res = await request(app).get('/api/errors/stats').set(auth(token));
    expect(res.body.data.regressions).toBe(1);

    const [g] = await groups();
    expect(g.reopenCount).toBe(1);
  });

  it('splits by where it broke, and names the worst endpoints', async () => {
    // "Worst" is ordered by occurrences, so the billing route is made
    // genuinely worse rather than merely present — asserting an order that a
    // tie would decide arbitrarily is a test that fails on Tuesdays.
    await inTenant(async () => {
      for (let i = 0; i < 3; i += 1) {
        await captureError({
          error: boom('server side'),
          req: { method: 'GET', originalUrl: '/api/billing/invoices/66f1c0a2b4e1f70012a4c111', headers: {} },
          statusCode: 500,
        });
      }
    });
    await request(app).post('/api/errors/report').send({ message: 'browser side', url: '/billing' });

    const res = await request(app).get('/api/errors/stats').set(auth(token));
    expect(res.body.data.bySource.backend.groups).toBe(1);
    expect(res.body.data.bySource.frontend.groups).toBe(1);

    const worst = res.body.data.topRoutes[0];
    expect(worst.route).toBe('/api/billing/invoices/:id');
    expect(worst.occurrences).toBe(3);
    // Both routes are listed, not just the winner.
    expect(res.body.data.topRoutes.map((r) => r.route)).toContain('/billing');
  });
});

describe('sorting', () => {
  it('orders by distinct people when asked to', async () => {
    // This is the sort that used to be declared as { lastSeenAt: -1 } — picking
    // "most people affected" silently gave you recency instead. The widest
    // error here is also the OLDEST, so recency ordering cannot pass this.
    const req = (id) => ({ method: 'GET', originalUrl: '/api/x', headers: {}, user: { _id: id, name: 'U', role: 'NURSE' } });
    await inTenant(async () => {
      for (const u of ['a', 'b', 'c']) await captureError({ error: boom('affects three'), req: req(u), statusCode: 500 });
      await captureError({ error: boom('affects one'), req: req('z'), statusCode: 500 });
    });

    const res = await request(app).get('/api/errors?sort=users').set(auth(token));
    expect(res.body.data[0].message).toBe('affects three');
    expect(res.body.data[0].affectedUsers).toBe(3);
  });
});

describe('export', () => {
  it('downloads a CSV of what is on screen', async () => {
    await inTenant(() => captureError({ error: boom('exported'), statusCode: 500 }));

    const res = await request(app).get('/api/errors/export?format=csv').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('.csv');

    const [header, ...rows] = res.text.trim().split('\n');
    expect(header).toContain('Occurrences');
    expect(header).toContain('People affected');
    // The file and line to open is the reason to export at all.
    expect(header).toContain('Top frame');
    expect(rows.join('\n')).toContain('exported');
  });

  it('downloads an xlsx when asked', async () => {
    await inTenant(() => captureError({ error: boom('spreadsheet'), statusCode: 500 }));

    const res = await request(app).get('/api/errors/export?format=xlsx').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
  });

  it('honours the filters rather than dumping everything', async () => {
    await inTenant(async () => {
      await captureError({ error: boom('a server error'), statusCode: 500 });
    });
    await request(app).post('/api/errors/report').send({ message: 'a browser error', url: '/x' });

    const res = await request(app).get('/api/errors/export?format=csv&source=frontend').set(auth(token));
    expect(res.text).toContain('a browser error');
    expect(res.text).not.toContain('a server error');
  });

  it('is refused to a role without errors:view', async () => {
    const recepToken = await login('recep@test.local', 'Recep@123');
    const res = await request(app).get('/api/errors/export?format=csv').set(auth(recepToken));
    expect(res.status).toBe(403);
  });

  it('does not treat "export" as an error id', async () => {
    // /export has to be declared above /:id or Express matches it as one, and
    // the download 404s in a way that looks like a missing record.
    const res = await request(app).get('/api/errors/export?format=csv').set(auth(token));
    expect(res.status).toBe(200);
  });
});
