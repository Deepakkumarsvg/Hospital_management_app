// Sentry, when there is a DSN to send to.
//
// This is the half of error tracking that watches the app from OUTSIDE it:
// alerts within seconds of a new failure, breadcrumbs and traces leading up to
// it, and — critically — reports that still arrive when the process itself is
// too broken to write to MongoDB. The ErrorLog collection is the half that
// keeps working with no third party involved. Neither replaces the other, so
// both capture paths run from the same place (services/errorTracking.js).
//
// The import is dynamic and its failure is swallowed on purpose: @sentry/node
// is a real dependency in package.json, but a deployment that has stripped it,
// or an install that half-finished, must not stop a hospital booting over a
// telemetry package. Without it, everything here turns into a no-op and the
// self-hosted half carries on alone.
import { APP_RELEASE, ENVIRONMENT } from './release.js';

let Sentry = null;
try {
  Sentry = await import('@sentry/node');
} catch {
  Sentry = null;
}

let enabled = false;

export const sentryEnabled = () => enabled;

// Called from instrument.js before anything else is imported. Sentry's
// automatic instrumentation patches http/express/mongodb as they load, so
// initialising after they are already in memory silently loses tracing.
export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || !Sentry) return false;

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || ENVIRONMENT,
    // Sentry groups releases across projects, so it wants something globally
    // meaningful rather than a bare SHA that could belong to any repo.
    release: `hms@${APP_RELEASE}`,

    // Performance tracing. Sampled rather than complete: traces are billed by
    // volume and a busy day would otherwise burn the quota by lunchtime, at
    // which point the errors stop arriving too. 10% is plenty to see which
    // endpoints are slow; it is not an audit trail.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),

    // This is a hospital system: the payloads passing through it are patient
    // records. Sentry's "send everything" defaults are wrong here and are
    // turned off deliberately rather than left to a data-scrubbing rule in a
    // dashboard nobody re-checks after the next person takes over.
    sendDefaultPii: false,

    beforeSend(event) {
      return scrubEvent(event);
    },
    beforeBreadcrumb(crumb) {
      // A breadcrumb for "POST /api/patients" is useful; one carrying the body
      // of that request is a patient record in a third party's log store.
      if (crumb?.data && typeof crumb.data === 'object') delete crumb.data.body;
      return crumb;
    },
  });

  enabled = true;
  return true;
}

// Strip anything that could carry clinical or personal data out of an event.
//
// Belt and braces on top of sendDefaultPii: false — that setting governs what
// the SDK collects automatically, and says nothing about what our own capture
// calls attach.
function scrubEvent(event) {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) {
      for (const h of ['authorization', 'cookie', 'x-tenant']) delete event.request.headers[h];
    }
    // Query strings on this API carry patient search terms.
    delete event.request.query_string;
    if (typeof event.request.url === 'string') event.request.url = event.request.url.split('?')[0];
  }
  // The user is identified by id and role — enough to answer "how many people
  // does this affect", without a name or an email address leaving the estate.
  if (event.user) {
    delete event.user.email;
    delete event.user.username;
    delete event.user.ip_address;
  }
  return event;
}

// Report to Sentry and hand back its event id, so the ErrorLog row can link to
// the trace Sentry has and the row does not. Never throws: a telemetry failure
// must not become the error the user sees.
export function captureToSentry(err, { level = 'error', tags = {}, user = null, extra = {} } = {}) {
  if (!enabled || !Sentry) return '';
  try {
    return Sentry.withScope((scope) => {
      scope.setLevel(level);
      for (const [k, v] of Object.entries(tags)) if (v) scope.setTag(k, String(v));
      if (user?.id) scope.setUser({ id: String(user.id), segment: user.role || undefined });
      scope.setContext('hms', extra);
      return Sentry.captureException(err);
    });
  } catch {
    return '';
  }
}

// Give in-flight events a chance to leave the process before it exits. Without
// this the crash that killed the server is the one report that never arrives.
export async function flushSentry(timeoutMs = 2000) {
  if (!enabled || !Sentry) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // Shutting down regardless.
  }
}
