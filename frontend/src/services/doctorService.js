import api from './api.js';
import { downloadFile } from '../utils/download.js';

export async function listDoctors(params = {}) {
  const { data } = await api.get('/doctors', { params });
  return { items: data.data, pagination: data.pagination };
}
export async function activeDoctors(department) {
  const { data } = await api.get('/doctors/active', { params: department ? { department } : {} });
  return data.data;
}
export async function getDoctor(id) {
  const { data } = await api.get(`/doctors/${id}`);
  return data.data;
}
// The Doctor profile linked to the logged-in user (null if unlinked).
export async function getMyDoctorProfile() {
  const { data } = await api.get('/doctors/me');
  return data.data;
}
export async function getDoctorStats() {
  const { data } = await api.get('/doctors/stats');
  return data.data;
}
export async function createDoctor(payload) {
  const { data } = await api.post('/doctors', payload);
  return data.data;
}
export async function updateDoctor(id, payload) {
  const { data } = await api.put(`/doctors/${id}`, payload);
  return data.data;
}
export async function deleteDoctor(id) {
  const { data } = await api.delete(`/doctors/${id}`);
  return data;
}

export function exportDoctors({ search, department, status } = {}, format = 'csv') {
  const date = new Date().toISOString().slice(0, 10);
  return downloadFile('/doctors/export', `doctors-${date}.${format}`, { search, department, status, format });
}
