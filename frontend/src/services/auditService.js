import api from './api.js';
import { downloadFile } from '../utils/download.js';

export async function listAuditLogs(params = {}) {
  const { data } = await api.get('/audit-logs', { params });
  return { items: data.data, pagination: data.pagination };
}

export const getAuditFacets = () => api.get('/audit-logs/facets').then((r) => r.data.data);

export function exportAuditLogs({ search, module, action, from, to } = {}, format = 'csv') {
  const date = new Date().toISOString().slice(0, 10);
  return downloadFile('/audit-logs/export', `audit-logs-${date}.${format}`, { search, module, action, from, to, format });
}
