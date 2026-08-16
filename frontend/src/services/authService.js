import api from './api.js';

export async function login(email, password) {
  const { data } = await api.post('/auth/login', { email, password });
  return data.data; // { token, user }
}

export async function fetchMe() {
  const { data } = await api.get('/auth/me');
  return data.data.user;
}

export async function logout() {
  try {
    await api.post('/auth/logout');
  } catch {
    // ignore; logout is best-effort on a stateless JWT
  }
}

export async function changePassword(currentPassword, newPassword) {
  const { data } = await api.post('/auth/change-password', { currentPassword, newPassword });
  return data;
}

export async function forgotPassword(email) {
  const { data } = await api.post('/auth/forgot-password', { email });
  return data;
}

export async function resetPassword(token, newPassword) {
  const { data } = await api.post('/auth/reset-password', { token, newPassword });
  return data;
}
