import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/inventoryService.js';
import { getSettings } from '../services/settingService.js';
import { generatePurchaseOrderPdf } from '../utils/pdf.js';
import { sendCsv, sendExcel, parseCsv } from '../utils/exporters.js';
import { audit } from '../utils/audit.js';

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
  const it = await service.deleteItem(req.params.id);
  audit(req, { action: 'DELETE', module: 'InventoryItem', recordId: it.code, description: `Deleted item ${it.name}` });
  sendSuccess(res, { message: 'Item deleted', data: null });
});
export const adjustStock = asyncHandler(async (req, res) => {
  const it = await service.adjustStock(req.params.id, req.body, req.user?._id);
  audit(req, {
    action: 'ADJUST', module: 'InventoryItem', recordId: it.code,
    description: `${req.body.type} ${req.body.quantity} ${it.name}${req.body.note ? ` — ${req.body.note}` : ''}`,
  });
  sendSuccess(res, { message: 'Stock updated', data: it });
});
export const itemTransactions = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Transactions', data: await service.itemTransactions(req.params.id) }));
export const itemBatches = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Batches', data: await service.itemBatches(req.params.id) }));
export const itemLastPrice = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Last price', data: { price: await service.lastPriceForVendor(req.params.id, req.query.vendor) } }));

// GET /api/inventory/items/export?format=csv|xlsx&search=&category=&lowStock=
export const exportItems = asyncHandler(async (req, res) => {
  const rows = await service.itemRowsForExport(req.query);
  const name = `inventory-items-${new Date().toISOString().slice(0, 10)}`;
  if (req.query.format === 'xlsx') return sendExcel(res, name, rows, 'Items');
  return sendCsv(res, name, rows);
});

// POST /api/inventory/items/import (multipart, field "file")
export const importItems = asyncHandler(async (req, res) => {
  const rows = await parseCsv(req.file.buffer);
  const result = await service.importItems(rows);
  sendSuccess(res, { message: 'Import complete', data: result });
});

// ---- Vendors ----
export const listVendors = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Vendors', data: await service.listVendors() }));
export const activeVendors = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Active vendors', data: await service.activeVendors() }));
export const createVendor = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: 201, message: 'Vendor created', data: await service.createVendor(req.body) }));
export const updateVendor = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Vendor updated', data: await service.updateVendor(req.params.id, req.body) }));
export const getVendor = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Vendor detail', data: await service.vendorDetail(req.params.id) }));
export const deleteVendor = asyncHandler(async (req, res) => {
  const v = await service.deleteVendor(req.params.id);
  audit(req, { action: 'DELETE', module: 'Vendor', recordId: v.code, description: `Deleted vendor ${v.name}` });
  sendSuccess(res, { message: 'Vendor deleted', data: null });
});

// GET /api/inventory/vendors/export?format=csv|xlsx
export const exportVendors = asyncHandler(async (req, res) => {
  const rows = await service.vendorRowsForExport();
  const name = `vendors-${new Date().toISOString().slice(0, 10)}`;
  if (req.query.format === 'xlsx') return sendExcel(res, name, rows, 'Vendors');
  return sendCsv(res, name, rows);
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
export const updatePurchaseOrder = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Purchase order updated', data: await service.updatePurchaseOrder(req.params.id, req.body) }));
export const placeOrder = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Purchase order placed', data: await service.placeOrder(req.params.id) }));
export const receivePurchaseOrder = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Purchase order received', data: await service.receivePurchaseOrder(req.params.id, req.body, req.user?._id) }));
export const cancelPurchaseOrder = asyncHandler(async (req, res) => {
  const po = await service.cancelPurchaseOrder(req.params.id);
  audit(req, { action: 'UPDATE', module: 'PurchaseOrder', recordId: po.poNo, description: `Cancelled purchase order ${po.poNo}` });
  sendSuccess(res, { message: 'Purchase order cancelled', data: po });
});

// GET /api/inventory/purchase-orders/export?format=csv|xlsx&search=&status=&vendor=
export const exportPurchaseOrders = asyncHandler(async (req, res) => {
  const rows = await service.poRowsForExport(req.query);
  const name = `purchase-orders-${new Date().toISOString().slice(0, 10)}`;
  if (req.query.format === 'xlsx') return sendExcel(res, name, rows, 'Purchase Orders');
  return sendCsv(res, name, rows);
});

// GET /api/inventory/purchase-orders/:id/pdf
export const purchaseOrderPdf = asyncHandler(async (req, res) => {
  const [po, settings] = await Promise.all([
    service.getPurchaseOrder(req.params.id),
    getSettings(),
  ]);
  await generatePurchaseOrderPdf(res, { po, settings });
});
