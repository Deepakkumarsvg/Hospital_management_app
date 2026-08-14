import api from './api.js';

export async function listInvoices(params = {}) {
  const { data } = await api.get('/billing/invoices', { params });
  return { items: data.data, pagination: data.pagination };
}
export const getInvoice = (id) => api.get(`/billing/invoices/${id}`).then((r) => r.data.data);
export const createInvoice = (p) => api.post('/billing/invoices', p).then((r) => r.data.data);
export const updateInvoice = (id, p) => api.put(`/billing/invoices/${id}`, p).then((r) => r.data.data);
export const recordPayment = (id, p) => api.post(`/billing/invoices/${id}/payments`, p).then((r) => r.data.data);
export const billingSuggestions = (patientId) => api.get(`/billing/suggestions/${patientId}`).then((r) => r.data.data);
export const getBillingStats = () => api.get('/billing/stats').then((r) => r.data.data);

import { openPdf } from '../utils/download.js';
export const downloadInvoicePdf = (id, invoiceNo) =>
  openPdf(`/billing/invoices/${id}/pdf`, `${invoiceNo || 'invoice'}.pdf`);
