import api from './api.js';
import { openPdf, downloadFile } from '../utils/download.js';

// Items
export async function listItems(params = {}) {
  const { data } = await api.get('/inventory/items', { params });
  return { items: data.data, pagination: data.pagination };
}
export const activeItems = () => api.get('/inventory/items/active').then((r) => r.data.data);
export const createItem = (p) => api.post('/inventory/items', p).then((r) => r.data.data);
export const updateItem = (id, p) => api.put(`/inventory/items/${id}`, p).then((r) => r.data.data);
export const deleteItem = (id) => api.delete(`/inventory/items/${id}`).then((r) => r.data);
export const adjustStock = (id, p) => api.post(`/inventory/items/${id}/adjust`, p).then((r) => r.data.data);
export const itemTransactions = (id) => api.get(`/inventory/items/${id}/transactions`).then((r) => r.data.data);
export const itemBatches = (id) => api.get(`/inventory/items/${id}/batches`).then((r) => r.data.data);
export const itemLastPrice = (id, vendorId) => api.get(`/inventory/items/${id}/last-price`, { params: { vendor: vendorId } }).then((r) => r.data.data.price);
export const getInventoryStats = () => api.get('/inventory/stats').then((r) => r.data.data);
export function exportItems({ search, category, lowStock } = {}, format = 'csv') {
  const date = new Date().toISOString().slice(0, 10);
  return downloadFile('/inventory/items/export', `inventory-items-${date}.${format}`, { search, category, lowStock, format });
}
export async function importItems(file) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/inventory/items/import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data.data;
}

// Vendors
export const listVendors = () => api.get('/inventory/vendors').then((r) => r.data.data);
export const activeVendors = () => api.get('/inventory/vendors/active').then((r) => r.data.data);
export const createVendor = (p) => api.post('/inventory/vendors', p).then((r) => r.data.data);
export const updateVendor = (id, p) => api.put(`/inventory/vendors/${id}`, p).then((r) => r.data.data);
export const getVendor = (id) => api.get(`/inventory/vendors/${id}`).then((r) => r.data.data);
export const deleteVendor = (id) => api.delete(`/inventory/vendors/${id}`).then((r) => r.data);
export function exportVendors(format = 'csv') {
  const date = new Date().toISOString().slice(0, 10);
  return downloadFile('/inventory/vendors/export', `vendors-${date}.${format}`, { format });
}

// Purchase orders
export async function listPurchaseOrders(params = {}) {
  const { data } = await api.get('/inventory/purchase-orders', { params });
  return { items: data.data, pagination: data.pagination };
}
export const getPurchaseOrder = (id) => api.get(`/inventory/purchase-orders/${id}`).then((r) => r.data.data);
export const createPurchaseOrder = (p) => api.post('/inventory/purchase-orders', p).then((r) => r.data.data);
export const updatePurchaseOrder = (id, p) => api.put(`/inventory/purchase-orders/${id}`, p).then((r) => r.data.data);
export const placeOrder = (id) => api.patch(`/inventory/purchase-orders/${id}/place`).then((r) => r.data.data);
export const receivePurchaseOrder = (id, items) => api.patch(`/inventory/purchase-orders/${id}/receive`, items ? { items } : {}).then((r) => r.data.data);
export const cancelPurchaseOrder = (id) => api.patch(`/inventory/purchase-orders/${id}/cancel`).then((r) => r.data.data);
export function exportPurchaseOrders({ search, status, vendor } = {}, format = 'csv') {
  const date = new Date().toISOString().slice(0, 10);
  return downloadFile('/inventory/purchase-orders/export', `purchase-orders-${date}.${format}`, { search, status, vendor, format });
}
export const downloadPurchaseOrderPdf = (id, poNo) =>
  openPdf(`/inventory/purchase-orders/${id}/pdf`, `${poNo || 'purchase-order'}.pdf`);
