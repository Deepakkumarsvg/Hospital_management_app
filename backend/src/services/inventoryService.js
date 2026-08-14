import { InventoryItem } from '../models/InventoryItem.js';
import { Vendor } from '../models/Vendor.js';
import { PurchaseOrder } from '../models/PurchaseOrder.js';
import { StockTransaction } from '../models/StockTransaction.js';
import { ApiError } from '../utils/ApiError.js';

// ---------- Items ----------
export async function listItems({ page, limit, search, category, lowStock }) {
  const filter = {};
  if (category && category !== 'ALL') filter.category = category;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { code: rx }];
  }
  if (lowStock === 'true') filter.$expr = { $lte: ['$currentStock', '$minStock'] };
  const [items, total] = await Promise.all([
    InventoryItem.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit),
    InventoryItem.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}
export const activeItems = () => InventoryItem.find({ status: 'ACTIVE' }).sort({ name: 1 });
export const createItem = (data) => InventoryItem.create(data);
export async function updateItem(id, data) {
  const it = await InventoryItem.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!it) throw ApiError.notFound('Item not found', 'ITEM_NOT_FOUND');
  return it;
}
export async function deleteItem(id) {
  const it = await InventoryItem.findByIdAndDelete(id);
  if (!it) throw ApiError.notFound('Item not found', 'ITEM_NOT_FOUND');
  return it;
}

// Manual stock movement — always writes an audit transaction.
export async function adjustStock(id, { type, quantity, reference, note }, userId) {
  const item = await InventoryItem.findById(id);
  if (!item) throw ApiError.notFound('Item not found', 'ITEM_NOT_FOUND');

  let delta;
  if (type === 'IN') delta = Math.abs(quantity);
  else if (type === 'OUT') delta = -Math.abs(quantity);
  else delta = quantity; // ADJUST: signed
  if (item.currentStock + delta < 0) throw ApiError.badRequest('Resulting stock cannot be negative', 'NEGATIVE_STOCK');

  item.currentStock += delta;
  await item.save();
  await StockTransaction.create({ item: item._id, type, quantity: delta, balanceAfter: item.currentStock, reference, note, by: userId });
  return item;
}

export async function itemTransactions(id) {
  return StockTransaction.find({ item: id }).populate('by', 'name').sort({ createdAt: -1 }).limit(100);
}

// ---------- Vendors ----------
export const listVendors = () => Vendor.find().sort({ name: 1 });
export const activeVendors = () => Vendor.find({ status: 'ACTIVE' }).sort({ name: 1 });
export const createVendor = (data) => Vendor.create(data);
export async function updateVendor(id, data) {
  const v = await Vendor.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!v) throw ApiError.notFound('Vendor not found', 'VENDOR_NOT_FOUND');
  return v;
}
export async function deleteVendor(id) {
  const v = await Vendor.findByIdAndDelete(id);
  if (!v) throw ApiError.notFound('Vendor not found', 'VENDOR_NOT_FOUND');
  return v;
}

// ---------- Purchase orders ----------
const PO_POPULATE = [{ path: 'vendor', select: 'name code' }, { path: 'createdBy', select: 'name' }];

export async function listPurchaseOrders({ page, limit, status }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  const [items, total] = await Promise.all([
    PurchaseOrder.find(filter).populate(PO_POPULATE).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    PurchaseOrder.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}
export async function getPurchaseOrder(id) {
  const po = await PurchaseOrder.findById(id).populate(PO_POPULATE);
  if (!po) throw ApiError.notFound('Purchase order not found', 'PO_NOT_FOUND');
  return po;
}

export async function createPurchaseOrder(data, userId) {
  const vendor = await Vendor.findById(data.vendor).select('_id');
  if (!vendor) throw ApiError.badRequest('Vendor does not exist', 'VENDOR_NOT_FOUND');

  const items = [];
  let total = 0;
  for (const line of data.items) {
    const item = await InventoryItem.findById(line.item).select('name unitPrice');
    if (!item) throw ApiError.badRequest('Item does not exist', 'ITEM_NOT_FOUND');
    const unitPrice = line.unitPrice ?? item.unitPrice;
    const lineTotal = unitPrice * line.quantity;
    total += lineTotal;
    items.push({ item: item._id, name: item.name, quantity: line.quantity, unitPrice, lineTotal });
  }
  const po = new PurchaseOrder({ vendor: data.vendor, items, total, notes: data.notes || '', createdBy: userId });
  await po.save();
  return po.populate(PO_POPULATE);
}

// Receiving a PO stocks in every line and logs transactions.
export async function receivePurchaseOrder(id, userId) {
  const po = await PurchaseOrder.findById(id);
  if (!po) throw ApiError.notFound('Purchase order not found', 'PO_NOT_FOUND');
  if (po.status === 'RECEIVED') throw ApiError.badRequest('Purchase order already received', 'PO_ALREADY_RECEIVED');
  if (po.status === 'CANCELLED') throw ApiError.badRequest('Cannot receive a cancelled order', 'PO_CANCELLED');

  for (const line of po.items) {
    const item = await InventoryItem.findById(line.item);
    if (!item) continue;
    item.currentStock += line.quantity;
    await item.save();
    await StockTransaction.create({ item: item._id, type: 'IN', quantity: line.quantity, balanceAfter: item.currentStock, reference: po.poNo, note: 'Goods receipt', by: userId });
  }
  po.status = 'RECEIVED';
  po.receivedAt = new Date();
  await po.save();
  return po.populate(PO_POPULATE);
}

export async function cancelPurchaseOrder(id) {
  const po = await PurchaseOrder.findById(id);
  if (!po) throw ApiError.notFound('Purchase order not found', 'PO_NOT_FOUND');
  if (po.status === 'RECEIVED') throw ApiError.badRequest('Cannot cancel a received order', 'PO_RECEIVED');
  po.status = 'CANCELLED';
  await po.save();
  return po.populate(PO_POPULATE);
}

export async function inventoryStats() {
  const [totalItems, lowStock, vendors, openPOs] = await Promise.all([
    InventoryItem.countDocuments({ status: 'ACTIVE' }),
    InventoryItem.countDocuments({ $expr: { $lte: ['$currentStock', '$minStock'] }, status: 'ACTIVE' }),
    Vendor.countDocuments({ status: 'ACTIVE' }),
    PurchaseOrder.countDocuments({ status: 'ORDERED' }),
  ]);
  return { totalItems, lowStock, vendors, openPOs };
}
