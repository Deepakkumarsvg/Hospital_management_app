import api from './api.js';

export const listPlans = (params = {}) => api.get('/tariffs', { params }).then((r) => r.data.data);
export const activePlans = () => api.get('/tariffs/active').then((r) => r.data.data);
export const getPlan = (id) => api.get(`/tariffs/${id}`).then((r) => r.data.data);
export const createPlan = (p) => api.post('/tariffs', p).then((r) => r.data.data);
export const updatePlan = (id, p) => api.put(`/tariffs/${id}`, p).then((r) => r.data.data);
export const makeDefault = (id) => api.patch(`/tariffs/${id}/default`).then((r) => r.data.data);
export const deletePlan = (id) => api.delete(`/tariffs/${id}`).then((r) => r.data);

export const listRates = (id, serviceType) =>
  api.get(`/tariffs/${id}/rates`, { params: { serviceType } }).then((r) => r.data.data);
export const setRate = (id, p) => api.put(`/tariffs/${id}/rates`, p).then((r) => r.data.data);
export const setRatesBulk = (id, p) => api.post(`/tariffs/${id}/rates/bulk`, p).then((r) => r.data.data);
