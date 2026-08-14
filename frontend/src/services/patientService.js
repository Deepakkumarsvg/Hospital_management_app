import api from './api.js';

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
