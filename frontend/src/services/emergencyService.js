import api from './api.js';

export const triageScale = () => api.get('/emergency/triage-scale').then((r) => r.data.data);
export const getQueue = () => api.get('/emergency/queue').then((r) => r.data.data);
export const getErStats = (params = {}) => api.get('/emergency/stats', { params }).then((r) => r.data.data);
export const getVisit = (id) => api.get(`/emergency/${id}`).then((r) => r.data.data);

export async function listVisits(params = {}) {
  const { data } = await api.get('/emergency', { params });
  return { items: data.data, pagination: data.pagination };
}

export const registerArrival = (p) => api.post('/emergency', p).then((r) => r.data.data);
export const triage = (id, p) => api.patch(`/emergency/${id}/triage`, p).then((r) => r.data.data);
export const startTreatment = (id, doctor) => api.patch(`/emergency/${id}/start`, { doctor }).then((r) => r.data.data);
export const updateVisit = (id, p) => api.put(`/emergency/${id}`, p).then((r) => r.data.data);
export const observe = (id) => api.patch(`/emergency/${id}/observe`).then((r) => r.data.data);
export const identify = (id, patient) => api.patch(`/emergency/${id}/identify`, { patient }).then((r) => r.data.data);
export const flagMLC = (id, p) => api.patch(`/emergency/${id}/mlc`, p).then((r) => r.data.data);
export const dispose = (id, p) => api.patch(`/emergency/${id}/dispose`, p).then((r) => r.data.data);
