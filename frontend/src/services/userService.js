import api from './api.js';

export async function listUsers(params = {}) {
  const { data } = await api.get('/users', { params });
  return { items: data.data, pagination: data.pagination };
}
export async function listRoles() {
  const { data } = await api.get('/users/roles');
  return data.data;
}
export async function getUser(id) {
  const { data } = await api.get(`/users/${id}`);
  return data.data;
}
export async function getUserStats() {
  const { data } = await api.get('/users/stats');
  return data.data;
}
export async function createUser(payload) {
  const { data } = await api.post('/users', payload);
  return data.data;
}
export async function updateUser(id, payload) {
  const { data } = await api.put(`/users/${id}`, payload);
  return data.data;
}
export async function deleteUser(id) {
  const { data } = await api.delete(`/users/${id}`);
  return data;
}
