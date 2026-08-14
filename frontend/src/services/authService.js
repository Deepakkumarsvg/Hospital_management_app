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
