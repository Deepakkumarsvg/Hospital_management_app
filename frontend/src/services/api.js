import axios from 'axios';
import { reportError } from './errorReporting.js';

// Single axios instance for the whole app.
// baseURL is relative so Vite's dev proxy (and prod reverse proxy) forwards /api.
const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  // The refresh token is an httpOnly cookie; without this axios would not send
  // it and every silent refresh would fail.
  withCredentials: true,
});

const TOKEN_KEY = 'hms-token';
const TENANT_KEY = 'hms-tenant';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// The selected hospital (tenant). Defaults to 'default' so single-hospital
// deployments work with no configuration.
export function getTenant() {
  return localStorage.getItem(TENANT_KEY) || 'default';
}
export function setTenant(slug) {
  if (slug) localStorage.setItem(TENANT_KEY, slug);
  else localStorage.removeItem(TENANT_KEY);
}

// Attach the JWT + tenant to every request. A call can target a different
// hospital for one request by passing `{ tenant: 'slug' }` in its config —
// used by the login screen to preview a tenant's branding before committing
// to it — without touching the stored selection.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Tenant'] = config.tenant || getTenant();
  return config;
});

// What to show when the server gave us no message of its own. Axios's own
// text ("Request failed with status code 500") is meaningless to a
// receptionist staring at a login screen, so it is never surfaced as-is.
function fallbackMessage(status, error) {
  if (error.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.';
  if (!status) return 'Cannot reach the server. Check your connection and try again.';

  if (status === 503) return 'The service is temporarily unavailable. Please try again in a moment.';
  if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (status >= 500) return 'Something went wrong on the server. Please try again, or contact IT if it continues.';
  if (status === 404) return 'That item could not be found.';
  if (status === 403) return 'You do not have permission to do that.';
  return 'Something went wrong. Please try again.';
}

// Access tokens are short-lived, so a 401 is usually "this one just expired"
// rather than "you are not signed in". The refresh cookie can mint a new one
// without the user noticing.
//
// Refreshes are funnelled through a single in-flight promise: a screen that
// fires eight requests at once must not fire eight refreshes, which would rotate
// the token eight times and — because rotation retires the previous token —
// trip the replay guard and sign the user out of everything.
let refreshInFlight = null;

function refreshAccessToken() {
  refreshInFlight ??= axios
    .post('/api/auth/refresh', null, {
      withCredentials: true,
      headers: { 'X-Tenant': getTenant() },
    })
    .then((res) => {
      const token = res.data?.data?.token;
      if (!token) throw new Error('no token');
      setToken(token);
      return token;
    })
    .finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

function forceSignOut() {
  setToken(null);
  if (window.location.pathname !== '/login') window.location.assign('/login');
}

// Normalise errors so UI can always read err.message / err.code.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error.response?.status;
    const data = error.response?.data;
    const config = error.config || {};

    const url = config.url || '';
    // Endpoints where a 401 is the answer, not a stale token.
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/refresh');

    if (status === 401 && !isAuthCall && !config._retried) {
      try {
        const token = await refreshAccessToken();
        // Replay the original request with the new token.
        config._retried = true;
        config.headers = { ...config.headers, Authorization: `Bearer ${token}` };
        return api.request(config);
      } catch {
        forceSignOut();
      }
    } else if (status === 401 && !isAuthCall) {
      forceSignOut();
    }

    // A 5xx is a bug on the server, and the server has already recorded it
    // from its own side. This report adds the half the server cannot see:
    // which screen the user was on, and what they were doing when it broke.
    //
    // 4xx are deliberately excluded — a rejected password or a validation
    // failure is the system working, and an error list full of those is an
    // error list nobody opens. Network failures are excluded too: the browser
    // cannot tell "the server is down" from "the wifi dropped", and if it
    // really is the former then the report has nowhere to go anyway.
    if (status >= 500) {
      reportError(new Error(`API ${status} on ${config.method?.toUpperCase() || 'GET'} ${url}`), {
        mechanism: 'api.response',
        status,
        endpoint: url,
        code: data?.error,
        // Correlates with the server's own ErrorLog entry and pino log line
        // for the very same failure.
        requestId: error.response?.headers?.['x-request-id'],
        route: window.location.pathname,
      });
    }

    // A non-JSON body (an HTML error page from a proxy, say) leaves `data` as
    // a string — that isn't a message we should show either.
    const serverMessage = typeof data?.message === 'string' ? data.message : null;

    return Promise.reject({
      status,
      code: data?.error || (status ? 'SERVER_ERROR' : 'NETWORK_ERROR'),
      message: serverMessage || fallbackMessage(status, error),
      details: data?.details,
    });
  }
);

export default api;
