import api from './api.js';
import { openPdf, downloadFile } from '../utils/download.js';

export const listAmbulances = () => api.get('/ambulance').then((r) => r.data.data);
export const createAmbulance = (p) => api.post('/ambulance', p).then((r) => r.data.data);
export const updateAmbulance = (id, p) => api.put(`/ambulance/${id}`, p).then((r) => r.data.data);
export const deleteAmbulance = (id) => api.delete(`/ambulance/${id}`).then((r) => r.data);
export async function listTrips(params = {}) {
  const { data } = await api.get('/ambulance/trips', { params });
  return { items: data.data, pagination: data.pagination };
}
export const startTrip = (p) => api.post('/ambulance/trips', p).then((r) => r.data.data);
export const updateTrip = (id, p) => api.put(`/ambulance/trips/${id}`, p).then((r) => r.data.data);
export const endTrip = (id, status) => api.patch(`/ambulance/trips/${id}/status`, { status }).then((r) => r.data.data);
export const getAmbulanceStats = () => api.get('/ambulance/stats').then((r) => r.data.data);
export function exportTrips({ search, status, ambulance } = {}, format = 'csv') {
  const date = new Date().toISOString().slice(0, 10);
  return downloadFile('/ambulance/trips/export', `ambulance-trips-${date}.${format}`, { search, status, ambulance, format });
}
export const downloadTripReceiptPdf = (id, tripNo) =>
  openPdf(`/ambulance/trips/${id}/pdf`, `${tripNo || 'ambulance-receipt'}.pdf`);
