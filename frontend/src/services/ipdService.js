import api from './api.js';

export async function listAdmissions(params = {}) {
  const { data } = await api.get('/ipd', { params });
  return { items: data.data, pagination: data.pagination };
}
export async function getAdmission(id) {
  const { data } = await api.get(`/ipd/${id}`);
  return data.data;
}
export async function admitPatient(payload) {
  const { data } = await api.post('/ipd', payload);
  return data.data;
}
export async function updateAdmission(id, payload) {
  const { data } = await api.put(`/ipd/${id}`, payload);
  return data.data;
}
export async function addNursingNote(id, note) {
  const { data } = await api.post(`/ipd/${id}/notes`, { note });
  return data.data;
}
export async function transferBed(id, bed) {
  const { data } = await api.patch(`/ipd/${id}/transfer`, { bed });
  return data.data;
}
export async function dischargePatient(id, payload) {
  const { data } = await api.patch(`/ipd/${id}/discharge`, payload);
  return data.data;
}
export async function cancelAdmission(id) {
  const { data } = await api.patch(`/ipd/${id}/cancel`);
  return data.data;
}
export async function getIpdStats() {
  const { data } = await api.get('/ipd/stats');
  return data.data;
}

import { openPdf, downloadFile } from '../utils/download.js';
export const downloadDischargePdf = (id, no) => openPdf(`/ipd/${id}/discharge-pdf`, `${no || 'discharge'}.pdf`);

export function exportAdmissions({ search, status, patient } = {}, format = 'csv') {
  const date = new Date().toISOString().slice(0, 10);
  return downloadFile('/ipd/export', `ipd-admissions-${date}.${format}`, { search, status, patient, format });
}
