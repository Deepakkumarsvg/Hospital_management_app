import api from './api.js';

export async function listDepartments(params = {}) {
  const { data } = await api.get('/departments', { params });
  return { items: data.data, pagination: data.pagination };
}
export async function activeDepartments() {
  const { data } = await api.get('/departments/active');
  return data.data;
}
export async function createDepartment(payload) {
  const { data } = await api.post('/departments', payload);
  return data.data;
}
export async function updateDepartment(id, payload) {
  const { data } = await api.put(`/departments/${id}`, payload);
  return data.data;
}
export async function deleteDepartment(id) {
  const { data } = await api.delete(`/departments/${id}`);
  return data;
}
