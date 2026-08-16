import api from './api.js';
import { downloadFile, openPdf } from '../utils/download.js';

export async function getReportSummary(params = {}) {
  const { data } = await api.get('/reports/summary', { params });
  return data.data;
}

export async function getDoctorActivity(params = {}) {
  const { data } = await api.get('/reports/doctor-activity', { params });
  return data.data;
}

export function exportSummary(format = 'csv', { from, to } = {}) {
  const name = `hms-summary-${from || 'all'}_${to || 'all'}.${format}`;
  return downloadFile('/reports/export/summary', name, { format, from, to });
}

export function downloadSummaryPdf({ from, to } = {}) {
  const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
  return openPdf(`/reports/export/summary/pdf${qs ? `?${qs}` : ''}`, `hms-summary-${from || 'all'}_${to || 'all'}.pdf`);
}

export function exportInvoices(format = 'csv', { from, to } = {}) {
  const name = `invoices-${from || 'all'}_${to || 'all'}.${format}`;
  return downloadFile('/reports/export/invoices', name, { format, from, to });
}

export function exportDoctorActivity(format = 'csv', { from, to } = {}) {
  const name = `doctor-activity-${from || 'all'}_${to || 'all'}.${format}`;
  return downloadFile('/reports/export/doctor-activity', name, { format, from, to });
}
