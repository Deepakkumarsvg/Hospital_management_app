import api from './api.js';

export async function listDeposits(params = {}) {
  const { data } = await api.get('/deposits', { params });
  return { items: data.data, pagination: data.pagination };
}

export const getDeposit = (id) => api.get(`/deposits/${id}`).then((r) => r.data.data);
export const balanceFor = (patientId) => api.get(`/deposits/balance/${patientId}`).then((r) => r.data.data);
export const collectDeposit = (p) => api.post('/deposits', p).then((r) => r.data.data);
export const topUpDeposit = (id, p) => api.post(`/deposits/${id}/top-up`, p).then((r) => r.data.data);
export const applyDeposit = (id, p) => api.post(`/deposits/${id}/apply`, p).then((r) => r.data.data);
export const refundDeposit = (id, p) => api.post(`/deposits/${id}/refund`, p).then((r) => r.data.data);
export const closeDeposit = (id) => api.patch(`/deposits/${id}/close`).then((r) => r.data.data);
