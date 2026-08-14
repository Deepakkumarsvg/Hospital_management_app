import api from './api.js';
import { downloadFile } from '../utils/download.js';

export async function getReportSummary(params = {}) {
  const { data } = await api.get('/reports/summary', { params });
  return data.data;
}

export async function getDoctorActivity(params = {}) {
  const { data } = await api.get('/reports/doctor-activity', { params });
  return data.data;
}

export const exportInvoices = (format, params = {}) =>
  downloadFile('/reports/export/invoices', `invoices.${format === 'xlsx' ? 'xlsx' : 'csv'}`, { ...params, format });

export const exportDoctorActivity = (format, params = {}) =>
  downloadFile('/reports/export/doctor-activity', `doctor-activity.${format === 'xlsx' ? 'xlsx' : 'csv'}`, { ...params, format });
