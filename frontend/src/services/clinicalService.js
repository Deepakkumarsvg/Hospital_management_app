import api from './api.js';

export const clinicalOptions = () => api.get('/clinical/options').then((r) => r.data.data);

// Observations
export const listVitals = (encounterId) => api.get(`/clinical/vitals/${encounterId}`).then((r) => r.data.data);
export const vitalsTrend = (encounterId) => api.get(`/clinical/vitals/${encounterId}/trend`).then((r) => r.data.data);
export const recordVitals = (p) => api.post('/clinical/vitals', p).then((r) => r.data.data);

// Notes
export const listNotes = (encounterId, params = {}) =>
  api.get(`/clinical/notes/${encounterId}`, { params }).then((r) => r.data.data);
export const addNote = (p) => api.post('/clinical/notes', p).then((r) => r.data.data);
export const signNote = (id) => api.patch(`/clinical/notes/${id}/sign`).then((r) => r.data.data);
export const amendNote = (id, body) => api.patch(`/clinical/notes/${id}`, { body }).then((r) => r.data.data);

// Medication
export const prescribe = (p) => api.post('/clinical/orders', p).then((r) => r.data.data);
export const stopOrder = (id, reason) => api.patch(`/clinical/orders/${id}/stop`, { reason }).then((r) => r.data.data);
export const holdOrder = (id, hold) => api.patch(`/clinical/orders/${id}/hold`, { hold }).then((r) => r.data.data);
export const getMar = (encounterId, day) =>
  api.get(`/clinical/mar/${encounterId}`, { params: day ? { day } : {} }).then((r) => r.data.data);
export const missedDoses = (encounterId) => api.get(`/clinical/mar/${encounterId}/missed`).then((r) => r.data.data);
export const administer = (orderId, p) =>
  api.post(`/clinical/orders/${orderId}/administer`, p).then((r) => r.data.data);
