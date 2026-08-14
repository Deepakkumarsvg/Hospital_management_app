import api from './api.js';

export async function listAppointments(params = {}) {
  const { data } = await api.get('/appointments', { params });
  return { items: data.data, pagination: data.pagination };
}
export async function getAppointment(id) {
  const { data } = await api.get(`/appointments/${id}`);
  return data.data;
}
export async function getAppointmentStats() {
  const { data } = await api.get('/appointments/stats');
  return data.data;
}
export async function createAppointment(payload) {
  const { data } = await api.post('/appointments', payload);
  return data.data;
}
export async function updateAppointment(id, payload) {
  const { data } = await api.put(`/appointments/${id}`, payload);
  return data.data;
}
export async function changeAppointmentStatus(id, status) {
  const { data } = await api.patch(`/appointments/${id}/status`, { status });
  return data.data;
}
export async function deleteAppointment(id) {
  const { data } = await api.delete(`/appointments/${id}`);
  return data;
}
