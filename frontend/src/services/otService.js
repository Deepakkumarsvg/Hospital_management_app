import api from './api.js';

export const listTheatres = () => api.get('/ot/theatres').then((r) => r.data.data);
export const activeTheatres = () => api.get('/ot/theatres/active').then((r) => r.data.data);
export const createTheatre = (p) => api.post('/ot/theatres', p).then((r) => r.data.data);
export const updateTheatre = (id, p) => api.put(`/ot/theatres/${id}`, p).then((r) => r.data.data);
export const deleteTheatre = (id) => api.delete(`/ot/theatres/${id}`).then((r) => r.data);

export async function listSurgeries(params = {}) {
  const { data } = await api.get('/ot/surgeries', { params });
  return { items: data.data, pagination: data.pagination };
}
export const getSurgery = (id) => api.get(`/ot/surgeries/${id}`).then((r) => r.data.data);
export const createSurgery = (p) => api.post('/ot/surgeries', p).then((r) => r.data.data);
export const updateSurgery = (id, p) => api.put(`/ot/surgeries/${id}`, p).then((r) => r.data.data);
export const changeSurgeryStatus = (id, status) => api.patch(`/ot/surgeries/${id}/status`, { status }).then((r) => r.data.data);
export const getOtStats = () => api.get('/ot/stats').then((r) => r.data.data);
