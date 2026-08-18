import api from './api.js';
import { downloadFile } from '../utils/download.js';

export async function listErrors(params = {}) {
  const { data } = await api.get('/errors', { params });
  return { items: data.data, pagination: data.pagination };
}

export const getErrorStats = () => api.get('/errors/stats').then((r) => r.data.data);

export const getError = (id) => api.get(`/errors/${id}`).then((r) => r.data.data);

export const setErrorResolved = (id, resolved) =>
  api.patch(`/errors/${id}/resolve`, { resolved }).then((r) => r.data.data);

export const deleteError = (id) => api.delete(`/errors/${id}`).then((r) => r.data);

// Downloads whatever the screen is currently filtered to, rather than
// everything — what you export should be what you were looking at.
export function exportErrors(params = {}, format = 'csv') {
  const date = new Date().toISOString().slice(0, 10);
  return downloadFile('/errors/export', `errors-${date}.${format}`, { ...params, format });
}
