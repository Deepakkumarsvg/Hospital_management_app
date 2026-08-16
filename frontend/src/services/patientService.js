import api from './api.js';
import { downloadFile } from '../utils/download.js';

export async function listPatients(params = {}) {
  const { data } = await api.get('/patients', { params });
  return { items: data.data, pagination: data.pagination };
}

export async function getPatient(id) {
  const { data } = await api.get(`/patients/${id}`);
  return data.data;
}

export async function getPatientStats() {
  const { data } = await api.get('/patients/stats');
  return data.data;
}

export async function createPatient(payload) {
  const { data } = await api.post('/patients', payload);
  return data.data;
}

export async function updatePatient(id, payload) {
  const { data } = await api.put(`/patients/${id}`, payload);
  return data.data;
}

export async function deletePatient(id) {
  const { data } = await api.delete(`/patients/${id}`);
  return data;
}

export function exportPatients({ search, status } = {}, format = 'csv') {
  const date = new Date().toISOString().slice(0, 10);
  return downloadFile('/patients/export', `patients-${date}.${format}`, { search, status, format });
}

// Folds `duplicateId`'s records into `survivorId` and removes the duplicate profile.
export async function mergePatients(survivorId, duplicateId) {
  const { data } = await api.post(`/patients/${survivorId}/merge`, { duplicateId });
  return data.data;
}
