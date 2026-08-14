import api from './api.js';

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
export const getInventoryStats = () => api.get('/inventory/stats').then((r) => r.data.data);

// Vendors
export const listVendors = () => api.get('/inventory/vendors').then((r) => r.data.data);
export const activeVendors = () => api.get('/inventory/vendors/active').then((r) => r.data.data);
export const createVendor = (p) => api.post('/inventory/vendors', p).then((r) => r.data.data);
export const updateVendor = (id, p) => api.put(`/inventory/vendors/${id}`, p).then((r) => r.data.data);
export const deleteVendor = (id) => api.delete(`/inventory/vendors/${id}`).then((r) => r.data);

// Purchase orders
export async function listPurchaseOrders(params = {}) {
  const { data } = await api.get('/inventory/purchase-orders', { params });
  return { items: data.data, pagination: data.pagination };
}
export const getPurchaseOrder = (id) => api.get(`/inventory/purchase-orders/${id}`).then((r) => r.data.data);
export const createPurchaseOrder = (p) => api.post('/inventory/purchase-orders', p).then((r) => r.data.data);
export const receivePurchaseOrder = (id) => api.patch(`/inventory/purchase-orders/${id}/receive`).then((r) => r.data.data);
export const cancelPurchaseOrder = (id) => api.patch(`/inventory/purchase-orders/${id}/cancel`).then((r) => r.data.data);
