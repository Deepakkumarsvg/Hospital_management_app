// Browser-side error reporting.
//
// A crash in the browser is the one class of failure the server never learns
// about on its own: the render throws, the screen goes blank, and the only
// trace of it is a console message on a receptionist's machine that nobody
// will ever read. Everything here exists to get that message off that machine.
//
// Two destinations, same as the server: Sentry when a DSN is configured, and
// the hospital's own /api/errors/report either way.
//
// Three rules hold throughout:
//   1. Reporting never throws. A failure to report a crash must not be a
//      second crash — that is how a broken page becomes an infinite loop.
//   2. Reporting never blocks the UI. Nothing here is awaited by a render.
//   3. The same error is reported ONCE per session. See shouldSend().

const DSN = import.meta.env.VITE_SENTRY_DSN;
const RELEASE = import.meta.env.VITE_APP_RELEASE || 'dev';
const ENVIRONMENT = import.meta.env.MODE;

let Sentry = null;

// Sentry is loaded lazily and only when a DSN exists.
//
// It is a ~90KB dependency, and the overwhelming majority of loads of this app
// are a nurse opening a patient list on hospital wifi. Statically importing it
// would put that cost in the initial bundle of every page for a feature that
// only matters when something has already gone wrong.
export async function initErrorReporting() {
  installGlobalHandlers();

  if (!DSN) return false;
  try {
    Sentry = await import('@sentry/react');
    Sentry.init({
      dsn: DSN,
      environment: ENVIRONMENT,
      release: `hms@${RELEASE}`,
      tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),

      // Session Replay records the DOM. On this app the DOM is a patient's
      // record, so it stays off — there is no sampling rate that makes
      // recording clinical screens into a third party acceptable.
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      sendDefaultPii: false,

      beforeSend(event) {
        // Query strings here carry patient search terms.
        if (event.request?.url) event.request.url = event.request.url.split('?')[0];
        if (event.user) {
          delete event.user.email;
          delete event.user.username;
          delete event.user.ip_address;
        }
        return event;
      },
    });
    return true;
  } catch {
    // A blocked CDN, an ad blocker eating the chunk, an offline machine —
    // none of these are reasons for the app not to load. The self-hosted
    // half carries on regardless.
    Sentry = null;
    return false;
  }
}

// Tell Sentry who is signed in — by id and role only.
//
// "Which 3 users" and "which 300" are different bugs with different urgency,
// and that distinction needs an identifier, not a name. A name or an email
// would be a patient's or a clinician's identity leaving the hospital's estate,
// which is a different thing entirely.
export function identifyUser(user) {
  try {
    Sentry?.setUser(user ? { id: String(user._id || user.id), segment: user.role } : null);
  } catch {
    // Never worth a crash.
  }
}

// --- Deduplication ----------------------------------------------------------

// A React render loop that throws re-throws on every frame. Without a gate,
// one broken screen posts thousands of identical reports — flooding the
// hospital's own database, burning the Sentry quota that pays for real alerts,
// and telling you nothing the first report did not.
//
// The server rate-limits this too, but the useful place to stop it is before
// it leaves the browser.
const seen = new Map();
const DEDUPE_WINDOW_MS = 60_000;
const MAX_PER_SESSION = 25;
let sent = 0;

function shouldSend(key) {
  if (sent >= MAX_PER_SESSION) return false;

  const now = Date.now();
  const last = seen.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return false;

  seen.set(key, now);
  sent += 1;
  return true;
}

// --- Reporting --------------------------------------------------------------

// The report is sent with fetch and `keepalive` rather than through the shared
// axios instance, on purpose:
//
//   • axios has a response interceptor that reports failures — routing reports
//     through it means a failing report reports itself, forever;
//   • axios's 401 handling would sign the user out mid-crash; and
//   • keepalive is what lets the request survive the page unloading, which is
//     exactly what a fatal error tends to be followed by.
function post(body) {
  try {
    const tenant = localStorage.getItem('hms-tenant') || 'default';
    const token = localStorage.getItem('hms-token');

    fetch('/api/errors/report', {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant': tenant,
        // Sent when present so the report can be attributed, but never
        // required — the crash on the login screen is the important one.
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch {
    // localStorage can throw in private-mode Safari. Not a reason to crash.
  }
}

// The one entry point. Everything else in this file, and every caller
// elsewhere in the app, ends up here.
export function reportError(error, context = {}) {
  try {
    const err = error instanceof Error ? error : new Error(String(error?.message || error));
    const key = `${err.name}:${err.message}:${context.component || ''}`;
    if (!shouldSend(key)) return;

    try {
      Sentry?.captureException(err, { extra: context });
    } catch {
      // Fall through to the self-hosted report regardless.
    }

    post({
      name: err.name,
      message: String(err.message || '').slice(0, 2000),
      stack: String(err.stack || '').slice(0, 8000),
      url: window.location.pathname,
      userAgent: navigator.userAgent,
      extra: context,
    });
  } catch {
    // Rule 1.
  }
}

// --- Global handlers --------------------------------------------------------

// React's ErrorBoundary catches render errors and nothing else. An exception in
// an event handler, a `.then()` with no `.catch()`, a failed dynamic import —
// none of them unmount anything, so none of them reach the boundary. These two
// listeners are the only thing that sees them.
let installed = false;

function installGlobalHandlers() {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (event) => {
    // Failed <img>/<script> loads fire this too, with no error object. They
    // are not exceptions and would drown the real ones.
    if (!event.error) return;
    reportError(event.error, { mechanism: 'window.onerror' });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason, { mechanism: 'unhandledrejection' });
  });
}
