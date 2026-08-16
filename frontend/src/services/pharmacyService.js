import api from './api.js';
import { openPdf, downloadFile } from '../utils/download.js';

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
export const adjustStock = (id, p) => api.post(`/pharmacy/medicines/${id}/adjust`, p).then((r) => r.data.data);
export const dispenseMedicines = (p) => api.post('/pharmacy/dispense', p).then((r) => r.data.data);
export async function listDispenses(params = {}) {
  const { data } = await api.get('/pharmacy/dispenses', { params });
  return { items: data.data, pagination: data.pagination };
}
export const getDispense = (id) => api.get(`/pharmacy/dispenses/${id}`).then((r) => r.data.data);
export const returnDispense = (id) => api.post(`/pharmacy/dispenses/${id}/return`).then((r) => r.data.data);
export const expiringBatches = (days = 90) => api.get('/pharmacy/expiring', { params: { days } }).then((r) => r.data.data);
export const getPharmacyStats = () => api.get('/pharmacy/stats').then((r) => r.data.data);

export function exportMedicines({ search, status, lowStock } = {}, format = 'csv') {
  const date = new Date().toISOString().slice(0, 10);
  return downloadFile('/pharmacy/medicines/export', `medicines-${date}.${format}`, { search, status, lowStock, format });
}
export function exportDispenses({ search, patient, doctor } = {}, format = 'csv') {
  const date = new Date().toISOString().slice(0, 10);
  return downloadFile('/pharmacy/dispenses/export', `dispenses-${date}.${format}`, { search, patient, doctor, format });
}
export const downloadDispenseReceiptPdf = (id, dispenseNo) =>
  openPdf(`/pharmacy/dispenses/${id}/pdf`, `${dispenseNo || 'dispense-receipt'}.pdf`);
