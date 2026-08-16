import api from './api.js';
import { openPdf, downloadFile } from '../utils/download.js';

export const listRadTests = (params = {}) => api.get('/radiology/tests', { params }).then((r) => r.data.data);
export const activeRadTests = () => api.get('/radiology/tests/active').then((r) => r.data.data);
export const createRadTest = (p) => api.post('/radiology/tests', p).then((r) => r.data.data);
export const updateRadTest = (id, p) => api.put(`/radiology/tests/${id}`, p).then((r) => r.data.data);
export const deleteRadTest = (id) => api.delete(`/radiology/tests/${id}`).then((r) => r.data);

export async function listRadOrders(params = {}) {
  const { data } = await api.get('/radiology/orders', { params });
  return { items: data.data, pagination: data.pagination };
}
export const getRadOrder = (id) => api.get(`/radiology/orders/${id}`).then((r) => r.data.data);
export const createRadOrder = (p) => api.post('/radiology/orders', p).then((r) => r.data.data);
export const changeRadStatus = (id, status, scheduledAt) => api.patch(`/radiology/orders/${id}/status`, { status, scheduledAt }).then((r) => r.data.data);
export const submitRadReport = (id, p) => api.put(`/radiology/orders/${id}/report`, p).then((r) => r.data.data);
export const getRadStats = () => api.get('/radiology/orders/stats').then((r) => r.data.data);

export function exportRadOrders({ search, status, patient, doctor } = {}, format = 'csv') {
  const date = new Date().toISOString().slice(0, 10);
  return downloadFile('/radiology/orders/export', `radiology-orders-${date}.${format}`, { search, status, patient, doctor, format });
}

export const downloadRadReportPdf = (id, orderNo) =>
  openPdf(`/radiology/orders/${id}/pdf`, `${orderNo || 'radiology-report'}.pdf`);
