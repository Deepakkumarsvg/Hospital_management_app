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

// Attach the JWT + tenant to every request.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Tenant'] = getTenant();
  return config;
});

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

    return Promise.reject({
      status,
      code: data?.error || 'NETWORK_ERROR',
      message: data?.message || error.message || 'Something went wrong',
      details: data?.details,
    });
  }
);

export default api;
