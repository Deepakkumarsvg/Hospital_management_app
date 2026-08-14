import api from './api.js';

export async function listMedicines(params = {}) {
  const { data } = await api.get('/pharmacy/medicines', { params });
  return { items: data.data, pagination: data.pagination };
}
export const activeMedicines = () => api.get('/pharmacy/medicines/active').then((r) => r.data.data);
export const getMedicine = (id) => api.get(`/pharmacy/medicines/${id}`).then((r) => r.data.data);
export const createMedicine = (p) => api.post('/pharmacy/medicines', p).then((r) => r.data.data);
export const updateMedicine = (id, p) => api.put(`/pharmacy/medicines/${id}`, p).then((r) => r.data.data);
export const deleteMedicine = (id) => api.delete(`/pharmacy/medicines/${id}`).then((r) => r.data);
export const receiveBatch = (id, p) => api.post(`/pharmacy/medicines/${id}/batches`, p).then((r) => r.data.data);
export const dispenseMedicines = (p) => api.post('/pharmacy/dispense', p).then((r) => r.data.data);
export async function listDispenses(params = {}) {
  const { data } = await api.get('/pharmacy/dispenses', { params });
  return { items: data.data, pagination: data.pagination };
}
export const expiringBatches = (days = 90) => api.get('/pharmacy/expiring', { params: { days } }).then((r) => r.data.data);
export const getPharmacyStats = () => api.get('/pharmacy/stats').then((r) => r.data.data);
