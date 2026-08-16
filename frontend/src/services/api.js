import axios from 'axios';

// Single axios instance for the whole app.
// baseURL is relative so Vite's dev proxy (and prod reverse proxy) forwards /api.
const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
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

// Normalise errors so UI can always read err.message / err.code.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    const data = error.response?.data;

    // Auto-logout on auth failure (except during an actual login attempt).
    const isLoginCall = error.config?.url?.includes('/auth/login');
    if (status === 401 && !isLoginCall) {
      setToken(null);
      if (window.location.pathname !== '/login') window.location.assign('/login');
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
