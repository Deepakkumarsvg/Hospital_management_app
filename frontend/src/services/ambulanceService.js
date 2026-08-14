import api from './api.js';

export const listAmbulances = () => api.get('/ambulance').then((r) => r.data.data);
export const createAmbulance = (p) => api.post('/ambulance', p).then((r) => r.data.data);
export const updateAmbulance = (id, p) => api.put(`/ambulance/${id}`, p).then((r) => r.data.data);
export const deleteAmbulance = (id) => api.delete(`/ambulance/${id}`).then((r) => r.data);
export const listTrips = () => api.get('/ambulance/trips').then((r) => r.data.data);
export const startTrip = (p) => api.post('/ambulance/trips', p).then((r) => r.data.data);
export const endTrip = (id, status) => api.patch(`/ambulance/trips/${id}/status`, { status }).then((r) => r.data.data);
export const getAmbulanceStats = () => api.get('/ambulance/stats').then((r) => r.data.data);
