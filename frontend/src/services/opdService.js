import api from './api.js';

export async function listVisits(params = {}) {
  const { data } = await api.get('/opd', { params });
  return { items: data.data, pagination: data.pagination };
}
export async function getVisit(id) {
  const { data } = await api.get(`/opd/${id}`);
  return data.data;
}
export async function createVisit(payload) {
  const { data } = await api.post('/opd', payload);
  return data.data;
}
export async function updateVisit(id, payload) {
  const { data } = await api.put(`/opd/${id}`, payload);
  return data.data;
}
export async function deleteVisit(id) {
  const { data } = await api.delete(`/opd/${id}`);
  return data;
}
export async function getOpdStats() {
  const { data } = await api.get('/opd/stats');
  return data.data;
}

import { openPdf } from '../utils/download.js';
export const downloadPrescriptionPdf = (id, visitNo) =>
  openPdf(`/opd/${id}/pdf`, `${visitNo || 'prescription'}.pdf`);

export const checkAllergies = (patientId, medicines) =>
  api.post('/opd/allergy-check', { patientId, medicines }).then((r) => r.data.data);
