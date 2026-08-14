import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/inventoryService.js';

// ---- Items ----
export const listItems = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listItems(req.query);
  sendSuccess(res, { message: 'Items', data: items, meta: pagination });
});
export const activeItems = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Active items', data: await service.activeItems() }));
export const stats = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Inventory stats', data: await service.inventoryStats() }));
export const createItem = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: 201, message: 'Item created', data: await service.createItem(req.body) }));
export const updateItem = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Item updated', data: await service.updateItem(req.params.id, req.body) }));
export const deleteItem = asyncHandler(async (req, res) => {
  await service.deleteItem(req.params.id);
  sendSuccess(res, { message: 'Item deleted', data: null });
});
export const adjustStock = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Stock updated', data: await service.adjustStock(req.params.id, req.body, req.user?._id) }));
export const itemTransactions = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Transactions', data: await service.itemTransactions(req.params.id) }));

// ---- Vendors ----
export const listVendors = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Vendors', data: await service.listVendors() }));
export const activeVendors = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Active vendors', data: await service.activeVendors() }));
export const createVendor = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: 201, message: 'Vendor created', data: await service.createVendor(req.body) }));
export const updateVendor = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Vendor updated', data: await service.updateVendor(req.params.id, req.body) }));
export const deleteVendor = asyncHandler(async (req, res) => {
  await service.deleteVendor(req.params.id);
  sendSuccess(res, { message: 'Vendor deleted', data: null });
});

// ---- Purchase orders ----
export const listPurchaseOrders = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listPurchaseOrders(req.query);
  sendSuccess(res, { message: 'Purchase orders', data: items, meta: pagination });
});
export const getPurchaseOrder = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Purchase order', data: await service.getPurchaseOrder(req.params.id) }));
export const createPurchaseOrder = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: 201, message: 'Purchase order created', data: await service.createPurchaseOrder(req.body, req.user?._id) }));
export const receivePurchaseOrder = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Purchase order received', data: await service.receivePurchaseOrder(req.params.id, req.user?._id) }));
export const cancelPurchaseOrder = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Purchase order cancelled', data: await service.cancelPurchaseOrder(req.params.id) }));
