import api, { getTenant } from './api.js';

export const getSettings = () => api.get('/settings').then((r) => r.data.data);
export const updateSettings = (payload) => api.put('/settings', payload).then((r) => r.data.data);

// Unauthenticated-safe subset ({ hospitalName, tagline, hasLogo }) — for the
// login screen, before a token exists.
export const getPublicSettings = () => api.get('/settings/public').then((r) => r.data.data);

// Public asset URL — no auth needed, safe to drop straight into an <img src>.
// A plain <img> can't carry the X-Tenant header the axios instance normally
// attaches, so the tenant is passed as a query param instead (the backend's
// tenant resolver accepts either). Cache-busted with updatedAt (when known)
// so a re-upload shows immediately instead of a stale cached image.
export function logoUrl(settings) {
  const hasLogo = settings?.hasLogo ?? !!settings?.logo?.storageKey;
  if (!hasLogo) return null;
  const params = new URLSearchParams({ tenant: getTenant(), v: settings.updatedAt || '' });
  return `/api/settings/logo?${params.toString()}`;
}

export async function uploadLogo(file) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/settings/logo', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data.data;
}

export async function removeLogo() {
  const { data } = await api.delete('/settings/logo');
  return data.data;
}
