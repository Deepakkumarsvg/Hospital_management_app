import api from './api.js';

export async function listClaims(params = {}) {
  const { data } = await api.get('/insurance/claims', { params });
  return { items: data.data, pagination: data.pagination };
}
export const getClaim = (id) => api.get(`/insurance/claims/${id}`).then((r) => r.data.data);
export const createClaim = (p) => api.post('/insurance/claims', p).then((r) => r.data.data);
export const updateClaim = (id, p) => api.put(`/insurance/claims/${id}`, p).then((r) => r.data.data);
export const changeClaimStatus = (id, p) => api.patch(`/insurance/claims/${id}/status`, p).then((r) => r.data.data);
export const getInsuranceStats = () => api.get('/insurance/stats').then((r) => r.data.data);
