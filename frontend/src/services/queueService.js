import api from './api.js';

export const priorities = () => api.get('/queue/priorities').then((r) => r.data.data);
export const displayBoard = (day) => api.get('/queue/board', { params: day ? { day } : {} }).then((r) => r.data.data);
export const queueStats = (day) => api.get('/queue/stats', { params: day ? { day } : {} }).then((r) => r.data.data);
export const doctorQueue = (doctorId, day) =>
  api.get(`/queue/doctor/${doctorId}`, { params: day ? { day } : {} }).then((r) => r.data.data);

export const issueToken = (p) => api.post('/queue', p).then((r) => r.data.data);
export const callNext = (doctorId) => api.post(`/queue/doctor/${doctorId}/next`).then((r) => r.data.data);
export const callToken = (id) => api.patch(`/queue/${id}/call`).then((r) => r.data.data);
export const startConsultation = (id, opdVisit) => api.patch(`/queue/${id}/start`, { opdVisit }).then((r) => r.data.data);
export const completeToken = (id) => api.patch(`/queue/${id}/complete`).then((r) => r.data.data);
export const skipToken = (id, reason) => api.patch(`/queue/${id}/skip`, { reason }).then((r) => r.data.data);
