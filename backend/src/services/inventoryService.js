import { InventoryItem } from '../models/InventoryItem.js';
import { InventoryItemBatch } from '../models/InventoryItemBatch.js';
import { Vendor } from '../models/Vendor.js';
import { PurchaseOrder } from '../models/PurchaseOrder.js';
import { StockTransaction } from '../models/StockTransaction.js';
import { withTransaction } from '../db/withTransaction.js';
import { ApiError } from '../utils/ApiError.js';
import { notify } from './notificationService.js';

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
  const it = await InventoryItem.findById(id);
  if (!it) throw ApiError.notFound('Item not found', 'ITEM_NOT_FOUND');

  const [txnCount, poCount] = await Promise.all([
    StockTransaction.countDocuments({ item: id }),
    PurchaseOrder.countDocuments({ 'items.item': id }),
  ]);
  if (txnCount || poCount) {
    throw ApiError.conflict(
      'This item has stock movement or purchase order history and cannot be deleted. Set its status to Inactive instead.',
      'ITEM_HAS_HISTORY',
      { transactions: txnCount, purchaseOrders: poCount }
    );
  }
  if (it.currentStock > 0) {
    throw ApiError.conflict(
      `This item still has ${it.currentStock} unit(s) in stock. Adjust it to zero before deleting.`,
      'ITEM_HAS_STOCK',
      { currentStock: it.currentStock }
    );
  }

  await InventoryItem.findByIdAndDelete(id);
  return it;
}

// Manual stock movement — always writes an audit transaction, and keeps
// batch quantities in sync (drawn FEFO on the way out, logged as their own
// "adjustment" batch on the way in) so the batch view never drifts from
// what's recorded here.
export async function adjustStock(id, { type, quantity, reference, note }, userId) {
  let delta;
  if (type === 'IN') delta = Math.abs(quantity);
  else if (type === 'OUT') delta = -Math.abs(quantity);
  else delta = quantity; // ADJUST: signed

  // Apply the movement in one conditional update, so concurrent adjustments
  // can't lose each other's write or take the stock below zero between the
  // check and the save.
  const filter = delta < 0 ? { _id: id, currentStock: { $gte: -delta } } : { _id: id };
  const item = await InventoryItem.findOneAndUpdate(filter, { $inc: { currentStock: delta } }, { new: true });
  if (!item) {
    const existing = await InventoryItem.findById(id).select('currentStock');
    if (!existing) throw ApiError.notFound('Item not found', 'ITEM_NOT_FOUND');
    throw ApiError.badRequest('Resulting stock cannot be negative', 'NEGATIVE_STOCK');
  }

  if (delta < 0) {
    let need = -delta;
    const batches = await InventoryItemBatch.find({ item: id, quantity: { $gt: 0 } }).sort({ expiryDate: 1 });
    for (const b of batches) {
      if (need <= 0) break;
      const take = Math.min(b.quantity, need);
      const res = await InventoryItemBatch.updateOne({ _id: b._id, quantity: { $gte: take } }, { $inc: { quantity: -take } });
      if (res.modifiedCount) need -= take;
    }
  } else if (delta > 0) {
    await InventoryItemBatch.create({
      item: id, batchNo: `ADJ-${Date.now()}`, quantity: delta, receivedQuantity: delta,
      unitPrice: item.unitPrice, receivedBy: userId,
    });
  }

  await StockTransaction.create({ item: item._id, type, quantity: delta, balanceAfter: item.currentStock, reference, note, by: userId });

  // currentStock is already post-movement, so the "before" value is whatever
  // we just applied taken back off it.
  const wasLow = item.currentStock - delta <= item.minStock;
  if (!wasLow && item.currentStock <= item.minStock) {
    notify({
      role: 'STORE_MANAGER', type: 'INVENTORY', title: 'Low stock alert',
      message: `${item.name} is down to ${item.currentStock} ${item.unit} (min ${item.minStock}) — reorder soon.`,
      link: '/inventory',
    });
  }

  return item;
}

export async function itemTransactions(id) {
  return StockTransaction.find({ item: id }).populate('by', 'name').sort({ createdAt: -1 }).limit(100);
}

export async function itemBatches(id) {
  return InventoryItemBatch.find({ item: id, quantity: { $gt: 0 } }).sort({ expiryDate: 1 });
}

// Most recent price paid to a specific vendor for this item — narrower and
// more useful than the item's overall lastPurchasePrice when comparing quotes.
export async function lastPriceForVendor(itemId, vendorId) {
  if (!vendorId) return null;
  const batch = await InventoryItemBatch.findOne({ item: itemId, vendor: vendorId }).sort({ createdAt: -1 });
  return batch?.unitPrice ?? null;
}

// Bulk upsert from an imported CSV — matches the shape produced by the
// items export (Code/Name/Category/Unit/Min Stock/Unit Price/Status).
// Stock is intentionally untouched here; it only ever moves through
// receive/adjust so the audit trail stays complete.
export async function importItems(rows) {
  let created = 0; let updated = 0;
  const errors = [];
  for (const [i, row] of rows.entries()) {
    const code = (row.Code || row.code || '').trim().toUpperCase();
    const name = (row.Name || row.name || '').trim();
    if (!code || !name) { errors.push(`Row ${i + 2}: Code and Name are required`); continue; }

    const data = {
      name,
      category: row.Category || row.category || undefined,
      unit: row.Unit || row.unit || undefined,
      minStock: row['Min Stock'] ?? row.minStock,
      unitPrice: row['Unit Price'] ?? row.unitPrice,
      status: row.Status || row.status || undefined,
    };
    Object.keys(data).forEach((k) => (data[k] === undefined || data[k] === '') && delete data[k]);
    if (data.minStock !== undefined) data.minStock = Number(data.minStock);
    if (data.unitPrice !== undefined) data.unitPrice = Number(data.unitPrice);

    try {
      const existing = await InventoryItem.findOne({ code });
      if (existing) { Object.assign(existing, data); await existing.save(); updated += 1; }
      else { await InventoryItem.create({ ...data, code }); created += 1; }
    } catch (err) {
      errors.push(`Row ${i + 2} (${code}): ${err.message}`);
    }
  }
  return { created, updated, errors };
}

// Flat rows for CSV/XLSX export.
export async function itemRowsForExport({ search, category, lowStock }) {
  const filter = {};
  if (category && category !== 'ALL') filter.category = category;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { code: rx }];
  }
  if (lowStock === 'true') filter.$expr = { $lte: ['$currentStock', '$minStock'] };
  const items = await InventoryItem.find(filter).sort({ name: 1 });
  return items.map((it) => ({
    Code: it.code, Name: it.name, Category: it.category, Unit: it.unit,
    'Current Stock': it.currentStock, 'Min Stock': it.minStock, 'Unit Price': it.unitPrice, Status: it.status,
  }));
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
  const v = await Vendor.findById(id);
  if (!v) throw ApiError.notFound('Vendor not found', 'VENDOR_NOT_FOUND');

  const poCount = await PurchaseOrder.countDocuments({ vendor: id });
  if (poCount) {
    throw ApiError.conflict(
      'This vendor has purchase orders on record and cannot be deleted. Set its status to Inactive instead.',
      'VENDOR_HAS_HISTORY',
      { purchaseOrders: poCount }
    );
  }

  await Vendor.findByIdAndDelete(id);
  return v;
}

export async function vendorRowsForExport() {
  const vendors = await Vendor.find().sort({ name: 1 });
  return vendors.map((v) => ({
    Code: v.code, Name: v.name, 'Contact Person': v.contactPerson, Phone: v.phone,
    Email: v.email, Address: v.address, Status: v.status,
  }));
}

// Vendor profile: order history + lifetime spend, for the "who is this
// vendor, how much have we bought from them" question the flat list can't answer.
export async function vendorDetail(id) {
  const vendor = await Vendor.findById(id);
  if (!vendor) throw ApiError.notFound('Vendor not found', 'VENDOR_NOT_FOUND');
  const orders = await PurchaseOrder.find({ vendor: id }).sort({ createdAt: -1 }).limit(50);
  const totalSpend = orders.filter((o) => o.status === 'RECEIVED').reduce((s, o) => s + o.total, 0);
  return {
    vendor, orders,
    stats: { totalOrders: orders.length, totalSpend, lastOrderAt: orders[0]?.createdAt || null },
  };
}

// ---------- Purchase orders ----------
const PO_POPULATE = [{ path: 'vendor', select: 'name code' }, { path: 'createdBy', select: 'name' }];

export async function listPurchaseOrders({ page, limit, search, status, vendor }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (vendor) filter.vendor = vendor;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const vendors = await Vendor.find({ name: rx }).select('_id');
    filter.$or = [{ poNo: rx }, { vendor: { $in: vendors.map((v) => v._id) } }];
  }
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

export async function poRowsForExport({ search, status, vendor }) {
  const { items } = await listPurchaseOrders({ page: 1, limit: 100000, search, status, vendor });
  return items.map((po) => ({
    'PO No': po.poNo,
    Vendor: po.vendor?.name || '',
    Items: (po.items || []).map((i) => `${i.name} x${i.quantity}`).join(', '),
    Total: po.total,
    Status: po.status,
    'Ordered On': po.orderedAt ? po.orderedAt.toISOString().slice(0, 10) : '',
    'Received On': po.receivedAt ? po.receivedAt.toISOString().slice(0, 10) : '',
  }));
}

// status defaults to ORDERED (placed immediately); pass 'DRAFT' to save it
// for later editing/approval before it's actually sent to the vendor.
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
  const status = data.status === 'DRAFT' ? 'DRAFT' : 'ORDERED';
  const po = new PurchaseOrder({
    vendor: data.vendor, items, total, notes: data.notes || '', createdBy: userId,
    status, orderedAt: status === 'ORDERED' ? new Date() : null,
  });
  await po.save();
  return po.populate(PO_POPULATE);
}

// Editing is only meaningful while nothing has shipped yet — once it's
// ORDERED (or beyond), changing line items would desync what the vendor
// actually has on their end.
export async function updatePurchaseOrder(id, data) {
  const po = await PurchaseOrder.findById(id);
  if (!po) throw ApiError.notFound('Purchase order not found', 'PO_NOT_FOUND');
  if (po.status !== 'DRAFT') throw ApiError.badRequest('Only a draft order can be edited', 'PO_NOT_DRAFT');

  if (data.vendor) {
    const vendor = await Vendor.findById(data.vendor).select('_id');
    if (!vendor) throw ApiError.badRequest('Vendor does not exist', 'VENDOR_NOT_FOUND');
    po.vendor = data.vendor;
  }
  if (data.items) {
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
    po.items = items;
    po.total = total;
  }
  if (data.notes !== undefined) po.notes = data.notes;
  await po.save();
  return po.populate(PO_POPULATE);
}

// Moves a saved DRAFT to ORDERED — the point at which it's considered sent
// to the vendor and starts counting toward "open POs".
export async function placeOrder(id) {
  const po = await PurchaseOrder.findById(id);
  if (!po) throw ApiError.notFound('Purchase order not found', 'PO_NOT_FOUND');
  if (po.status !== 'DRAFT') throw ApiError.badRequest('Only a draft order can be placed', 'PO_NOT_DRAFT');
  po.status = 'ORDERED';
  po.orderedAt = new Date();
  await po.save();
  return po.populate(PO_POPULATE);
}

// Receiving a PO stocks in each line and logs a transaction. Pass `items` to
// record a partial/short shipment (only those lines, up to what's still
// outstanding); omit it to receive everything still outstanding in full.
export async function receivePurchaseOrder(id, { items: receivedLines } = {}, userId) {
  // One goods receipt writes to four collections — the order's received
  // quantities, each item's stock, its batch, and the stock ledger. A partial
  // application would leave stock on the shelf that no ledger entry explains,
  // or an order marked received against stock that was never added. All of it
  // lands together or none of it does.
  const poId = await withTransaction(async (session) => {
    // Reading the PO inside the transaction (rather than before it) is what
    // makes two simultaneous receipts safe: the second one is serialised
    // against the first and sees its updated receivedQuantity, instead of both
    // reading zero and both stocking in the full shipment.
    const po = await PurchaseOrder.findById(id).session(session);
    if (!po) throw ApiError.notFound('Purchase order not found', 'PO_NOT_FOUND');
    if (po.status === 'RECEIVED') throw ApiError.badRequest('Purchase order already received', 'PO_ALREADY_RECEIVED');
    if (po.status === 'CANCELLED') throw ApiError.badRequest('Cannot receive a cancelled order', 'PO_CANCELLED');
    if (po.status === 'DRAFT') throw ApiError.badRequest('Place the order before receiving stock', 'PO_NOT_ORDERED');

    const requestedByItem = receivedLines
      ? new Map(receivedLines.map((l) => [String(l.item), { quantity: l.quantity, expiryDate: l.expiryDate }]))
      : null;

    for (const line of po.items) {
      const outstanding = line.quantity - line.receivedQuantity;
      if (outstanding <= 0) continue;
      const requestedLine = requestedByItem?.get(String(line.item));
      const requested = requestedByItem ? (requestedLine?.quantity ?? 0) : outstanding;
      const take = Math.min(outstanding, requested);
      if (take <= 0) continue;

      const item = await InventoryItem.findByIdAndUpdate(
        line.item,
        { $inc: { currentStock: take }, $set: { lastPurchasePrice: line.unitPrice } },
        { new: true, session }
      );
      if (!item) continue;

      await StockTransaction.create([{
        item: item._id, type: 'IN', quantity: take, balanceAfter: item.currentStock,
        reference: po.poNo, note: 'Goods receipt', by: userId,
      }], { session });

      // Multiple (partial) receipts against the same PO/item are the same
      // physical shipment — fold into one batch rather than creating a new
      // record (the unique {item, batchNo} index would reject a second insert
      // anyway).
      await InventoryItemBatch.updateOne(
        { item: line.item, batchNo: po.poNo },
        {
          $inc: { quantity: take, receivedQuantity: take },
          $setOnInsert: {
            vendor: po.vendor,
            expiryDate: requestedLine?.expiryDate || null,
            unitPrice: line.unitPrice,
            receivedBy: userId,
          },
        },
        { upsert: true, session }
      );

      line.receivedQuantity += take;
    }

    const fullyReceived = po.items.every((l) => l.receivedQuantity >= l.quantity);
    const anyReceived = po.items.some((l) => l.receivedQuantity > 0);
    po.status = fullyReceived ? 'RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : po.status;
    if (fullyReceived) po.receivedAt = new Date();
    await po.save({ session });
    return po._id;
  });

  // Re-read outside the transaction: populate() can't run on a committed
  // session's document without re-issuing its queries there.
  return PurchaseOrder.findById(poId).populate(PO_POPULATE);
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
    PurchaseOrder.countDocuments({ status: { $in: ['ORDERED', 'PARTIALLY_RECEIVED'] } }),
  ]);
  return { totalItems, lowStock, vendors, openPOs };
}
