// The single place an error becomes a report.
//
// Everything that goes wrong — a thrown request, a browser crash posted back
// from the frontend, a request slow enough to count as broken — arrives here
// and fans out to both destinations: Sentry for the alert, and the tenant's
// ErrorLog collection for the durable, self-hosted record.
//
// Two rules hold everywhere in this file:
//
//   1. It never throws. Reporting an error must not become the error the user
//      sees, and a hospital must not stop working because a telemetry write
//      failed. Every path swallows.
//   2. It never blocks the response. Captures are fire-and-forget; the caller
//      gets its promise back only so tests can await it.
import crypto from 'crypto';
import { ErrorLog, SAMPLE_LIMIT, AFFECTED_USER_LIMIT } from '../models/ErrorLog.js';
import { captureToSentry } from '../config/sentry.js';
import { APP_RELEASE, ENVIRONMENT } from '../config/release.js';
import { currentStore } from '../db/tenantContext.js';

// Long stacks are mostly node_modules frames nobody reads, and the document
// has to stay small enough that a hot error cannot bloat the collection.
const MAX_STACK = 8000;
const MAX_MESSAGE = 2000;

// Path segments that are identity rather than route: Mongo ObjectIds, UUIDs,
// and bare numbers. Replacing them is what makes "GET /api/patients/:id fails"
// one group instead of one group per patient.
const OBJECT_ID = /^[0-9a-f]{24}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC = /^\d+$/;

export function normaliseRoute(path = '') {
  // The query string is dropped entirely, not normalised: on this API it holds
  // patient search terms, and a fingerprint is not a place to keep those.
  const [pathname] = String(path).split('?');
  return pathname
    .split('/')
    .map((seg) => (OBJECT_ID.test(seg) || UUID.test(seg) || NUMERIC.test(seg) ? ':id' : seg))
    .join('/');
}

// Strip the parts of a message that vary between occurrences of the same bug,
// so they group. `Cast to ObjectId failed for value "66f1c0…"` and the same
// line for a different id are one defect, not two.
function stableMessage(message = '') {
  return String(message)
    .replace(/[0-9a-f]{24}/gi, '<id>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\b\d+\b/g, '<n>')
    .slice(0, 300);
}

// The first frame of the stack that belongs to us.
//
// Grouping on the message alone merges genuinely different bugs that happen to
// fail the same way ("Cannot read properties of undefined" is thrown by half
// the codebase); grouping on the whole stack splits one bug across every
// caller that reaches it. The first own-code frame is the line you would
// actually open, which is the line the group should be named after.
function topFrame(stack = '') {
  const lines = String(stack).split('\n').slice(1);
  for (const line of lines) {
    if (line.includes('node_modules') || line.includes('node:internal')) continue;
    const m = line.match(/\(?([^()\s]+:\d+:\d+)\)?\s*$/);
    if (m) return m[1].replace(/^.*[\\/](src|assets)[\\/]/, '$1/');
  }
  return '';
}

export function fingerprintOf({ source, kind, name, message, method, route, frame }) {
  const parts =
    kind === 'slow'
      // Slow requests are not thrown, so there is no stack to name them by —
      // the endpoint IS the identity.
      ? [source, kind, method, route]
      : [source, kind, name, stableMessage(message), frame || route];
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex');
}

// Is there a tenant database to write to right now?
//
// Captures from outside a request — a scheduler job, an uncaught exception at
// boot — have no tenant bound, and asking for a connection there throws. Those
// still reach Sentry; they just have no per-hospital row to land in.
const hasTenantContext = () => !!currentStore()?.conn;

function sampleFrom(req, { durationMs = 0, extra = null, client = null } = {}) {
  const user = req?.user;
  return {
    at: new Date(),
    requestId: req?.id || req?.headers?.['x-request-id'] || '',
    userId: user?._id ? String(user._id) : '',
    userName: user?.name || '',
    userRole: user?.role || '',
    ip: req?.ip || '',
    // Trimmed: some browsers send a paragraph, and the useful part ("Safari on
    // iOS") is always at the front.
    userAgent: String(client?.userAgent || req?.headers?.['user-agent'] || '').slice(0, 300),
    url: String(client?.url || req?.originalUrl || '').split('?')[0].slice(0, 500),
    durationMs,
    extra,
  };
}

// Upsert the group, push the sample, bump the counters — in one round trip.
//
// findOneAndUpdate rather than read-then-write because the same error arriving
// on two requests at once would otherwise race: both would read count=4 and
// both would write count=5. $inc is atomic, and $setOnInsert means the losing
// upsert of a genuinely new error updates the winner instead of failing on the
// unique index.
async function record(doc) {
  const {
    fingerprint, source, kind, name, message, stack,
    method, route, statusCode, sample, sentryEventId,
  } = doc;

  const now = new Date();
  const update = {
    $setOnInsert: {
      fingerprint,
      source,
      kind,
      firstSeenAt: now,
      resolved: false,
    },
    $set: {
      // Refreshed on every occurrence, so the row describes the LATEST
      // occurrence rather than a first sighting from three releases ago.
      name,
      message: String(message || '').slice(0, MAX_MESSAGE),
      stack: String(stack || '').slice(0, MAX_STACK),
      method,
      route,
      statusCode,
      release: APP_RELEASE,
      environment: ENVIRONMENT,
      lastSeenAt: now,
      ...(sentryEventId ? { sentryEventId } : {}),
    },
    $inc: { count: 1 },
    $push: {
      samples: { $each: [sample], $position: 0, $slice: SAMPLE_LIMIT },
    },
  };

  // A signed-in account is counted once no matter how many times it hits the
  // error, which is what makes "affects 40 people" mean anything.
  if (sample.userId) {
    update.$addToSet = { affectedUsers: sample.userId };
  }

  const updated = await ErrorLog.findOneAndUpdate({ fingerprint }, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });

  // Something marked resolved that is happening again was not resolved. Left
  // alone, a fix that did not work stays hidden under a filter nobody clears.
  if (updated?.resolved) {
    await ErrorLog.updateOne(
      { fingerprint },
      {
        $set: { resolved: false, resolvedAt: null, resolvedBy: '', resolvedInRelease: '' },
        $inc: { reopenCount: 1 },
      }
    );
  }

  // Trim the affected-user list if it has grown past the cap. Done after the
  // write rather than with $slice on $addToSet, which MongoDB does not allow.
  if (updated && updated.affectedUsers?.length > AFFECTED_USER_LIMIT) {
    await ErrorLog.updateOne(
      { fingerprint },
      { $push: { affectedUsers: { $each: [], $slice: -AFFECTED_USER_LIMIT } } }
    );
  }

  return updated;
}

// Capture a thrown error. Returns a promise so tests can await the write; the
// request path deliberately does not.
export function captureError({ error: err, req = null, source = 'backend', extra = null, statusCode = 500 } = {}) {
  try {
    const name = err?.name || 'Error';
    const message = err?.message || String(err);
    const stack = err?.stack || '';
    const route = normaliseRoute(req?.route?.path ? req.baseUrl + req.route.path : req?.originalUrl || '');

    const sentryEventId = captureToSentry(err, {
      tags: {
        source,
        route,
        method: req?.method,
        tenant: currentStore()?.tenant?.slug,
        request_id: req?.id,
      },
      user: req?.user ? { id: req.user._id, role: req.user.role } : null,
      extra: { statusCode, route, ...(extra || {}) },
    });

    if (!hasTenantContext()) return Promise.resolve(null);

    return record({
      fingerprint: fingerprintOf({
        source, kind: 'error', name, message,
        method: req?.method || '', route, frame: topFrame(stack),
      }),
      source,
      kind: 'error',
      name,
      message,
      stack,
      method: req?.method || '',
      route,
      statusCode,
      sentryEventId,
      sample: sampleFrom(req, { extra }),
    }).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

// Capture an error the BROWSER reported, from POST /api/errors/report.
//
// The payload is attacker-controlled — the endpoint is reachable by anyone who
// can load the login page — so nothing in it is trusted as a real Error. It is
// rebuilt into one here, with the stack taken as text rather than parsed.
export function captureClientError(payload, req) {
  try {
    const { name = 'Error', message = '', stack = '', url = '', userAgent = '', kind = 'error', extra = null } = payload || {};

    const err = new Error(String(message).slice(0, MAX_MESSAGE));
    err.name = String(name).slice(0, 100);
    err.stack = String(stack).slice(0, MAX_STACK) || err.stack;

    const route = normaliseRoute(new URL(url, 'http://x').pathname);

    const sentryEventId = captureToSentry(err, {
      tags: { source: 'frontend', route, tenant: currentStore()?.tenant?.slug },
      user: req?.user ? { id: req.user._id, role: req.user.role } : null,
      extra: { url, ...(extra || {}) },
    });

    if (!hasTenantContext()) return Promise.resolve(null);

    return record({
      fingerprint: fingerprintOf({
        source: 'frontend', kind, name: err.name, message,
        method: '', route, frame: topFrame(err.stack),
      }),
      source: 'frontend',
      kind: kind === 'slow' ? 'slow' : 'error',
      name: err.name,
      message,
      stack: err.stack,
      method: '',
      route,
      statusCode: 0,
      sentryEventId,
      sample: sampleFrom(req, { extra, client: { url, userAgent } }),
    }).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

// Capture a request that finished, but took long enough to be a defect.
//
// No exception exists here, so there is nothing to send Sentry as an error —
// its own tracing covers the timing side. This is the self-hosted half only.
export function captureSlowRequest({ method, path, durationMs, statusCode, req }) {
  try {
    if (!hasTenantContext()) return Promise.resolve(null);
    const route = normaliseRoute(path);

    return record({
      fingerprint: fingerprintOf({ source: 'backend', kind: 'slow', method, route }),
      source: 'backend',
      kind: 'slow',
      name: 'SlowRequest',
      message: `${method} ${route} took ${Math.round(durationMs)}ms`,
      stack: '',
      method,
      route,
      statusCode,
      sample: sampleFrom(req, { durationMs }),
    }).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

// Capture a database query slower than SLOW_QUERY_MS. Same shape as above:
// a completed operation that is nonetheless wrong.
export function captureSlowQuery({ model, op, durationMs, filterKeys = [] }) {
  try {
    if (!hasTenantContext()) return Promise.resolve(null);
    const route = `${model}.${op}`;

    return record({
      fingerprint: fingerprintOf({ source: 'backend', kind: 'slow', method: 'db', route }),
      source: 'backend',
      kind: 'slow',
      name: 'SlowQuery',
      // The filter's KEYS say which index is missing; its values are patient
      // data and are deliberately not recorded.
      message: `${model}.${op}(${filterKeys.join(', ')}) took ${Math.round(durationMs)}ms`,
      stack: '',
      method: 'db',
      route,
      statusCode: 0,
      sample: sampleFrom(null, { durationMs, extra: { filterKeys } }),
    }).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}
