import api from './api.js';

export const getTenants = () => api.get('/ops/tenants').then((r) => r.data.data);
export const createTenant = (payload) => api.post('/ops/tenants', payload).then((r) => r.data.data);
export const setTenantStatus = (slug, status) =>
  api.patch(`/ops/tenants/${slug}/status`, { status }).then((r) => r.data.data);
