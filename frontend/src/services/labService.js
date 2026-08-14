import api from './api.js';

// Test master
export const listLabTests = (params = {}) => api.get('/laboratory/tests', { params }).then((r) => r.data.data);
export const activeLabTests = () => api.get('/laboratory/tests/active').then((r) => r.data.data);
export const createLabTest = (p) => api.post('/laboratory/tests', p).then((r) => r.data.data);
export const updateLabTest = (id, p) => api.put(`/laboratory/tests/${id}`, p).then((r) => r.data.data);
export const deleteLabTest = (id) => api.delete(`/laboratory/tests/${id}`).then((r) => r.data);

// Orders
export async function listLabOrders(params = {}) {
  const { data } = await api.get('/laboratory/orders', { params });
  return { items: data.data, pagination: data.pagination };
}
export const getLabOrder = (id) => api.get(`/laboratory/orders/${id}`).then((r) => r.data.data);
export const createLabOrder = (p) => api.post('/laboratory/orders', p).then((r) => r.data.data);
export const changeLabStatus = (id, status) => api.patch(`/laboratory/orders/${id}/status`, { status }).then((r) => r.data.data);
export const enterLabResults = (id, items) => api.put(`/laboratory/orders/${id}/results`, { items }).then((r) => r.data.data);
export const getLabStats = () => api.get('/laboratory/orders/stats').then((r) => r.data.data);
