import api from './api.js';

// ---- Wards ----
export async function listWards() {
  const { data } = await api.get('/wards');
  return data.data;
}
export const createWard = (p) => api.post('/wards', p).then((r) => r.data.data);
export const updateWard = (id, p) => api.put(`/wards/${id}`, p).then((r) => r.data.data);
export const deleteWard = (id) => api.delete(`/wards/${id}`).then((r) => r.data);

// ---- Rooms ----
export async function listRooms(ward) {
  const { data } = await api.get('/rooms', { params: ward ? { ward } : {} });
  return data.data;
}
export const createRoom = (p) => api.post('/rooms', p).then((r) => r.data.data);
export const updateRoom = (id, p) => api.put(`/rooms/${id}`, p).then((r) => r.data.data);
export const deleteRoom = (id) => api.delete(`/rooms/${id}`).then((r) => r.data);

// ---- Beds ----
export async function listBeds(params = {}) {
  const { data } = await api.get('/beds', { params });
  return data.data;
}
export async function availableBeds(ward) {
  const { data } = await api.get('/beds/available', { params: ward ? { ward } : {} });
  return data.data;
}
export async function getBedMap() {
  const { data } = await api.get('/beds/map');
  return data.data;
}
export const createBed = (p) => api.post('/beds', p).then((r) => r.data.data);
export const updateBed = (id, p) => api.put(`/beds/${id}`, p).then((r) => r.data.data);
export const deleteBed = (id) => api.delete(`/beds/${id}`).then((r) => r.data);
