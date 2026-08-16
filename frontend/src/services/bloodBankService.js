import api from './api.js';

export const listDonors = () => api.get('/blood-bank/donors').then((r) => r.data.data);
export const createDonor = (p) => api.post('/blood-bank/donors', p).then((r) => r.data.data);
export const updateDonor = (id, p) => api.put(`/blood-bank/donors/${id}`, p).then((r) => r.data.data);
export const deleteDonor = (id) => api.delete(`/blood-bank/donors/${id}`).then((r) => r.data);

export const listUnits = (params = {}) => api.get('/blood-bank/units', { params }).then((r) => r.data.data);
export const getUnit = (id) => api.get(`/blood-bank/units/${id}`).then((r) => r.data.data);
export const getStock = () => api.get('/blood-bank/stock').then((r) => r.data.data);
export const collectUnit = (p) => api.post('/blood-bank/units', p).then((r) => r.data.data);
export const issueUnit = (id, payload) => api.patch(`/blood-bank/units/${id}/issue`, payload).then((r) => r.data.data);
export const reserveUnit = (id, patient) => api.patch(`/blood-bank/units/${id}/reserve`, { patient }).then((r) => r.data.data);
export const unreserveUnit = (id) => api.patch(`/blood-bank/units/${id}/unreserve`).then((r) => r.data.data);
export const discardUnit = (id) => api.patch(`/blood-bank/units/${id}/discard`).then((r) => r.data.data);
