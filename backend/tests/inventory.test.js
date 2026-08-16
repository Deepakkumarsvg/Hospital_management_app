// Goods-receipt atomicity and stock-movement integrity.
//
// Receiving a purchase order writes to four collections. These tests check
// that a repeated or concurrent receipt cannot stock the same shipment twice,
// and that the stock ledger always explains the stock on hand.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb, inTenant } from './helpers.js';

const { InventoryItem } = await import('../src/models/InventoryItem.js');
const { InventoryItemBatch } = await import('../src/models/InventoryItemBatch.js');
const { StockTransaction } = await import('../src/models/StockTransaction.js');
const { PurchaseOrder } = await import('../src/models/PurchaseOrder.js');
const { Vendor } = await import('../src/models/Vendor.js');
const inventory = await import('../src/services/inventoryService.js');

let ctx = {};

beforeAll(async () => { await connectTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

beforeEach(async () => {
  await inTenant(async () => {
    await Promise.all([
      InventoryItem.deleteMany({}), InventoryItemBatch.deleteMany({}),
      StockTransaction.deleteMany({}), PurchaseOrder.deleteMany({}), Vendor.deleteMany({}),
    ]);
    await InventoryItemBatch.syncIndexes();

    const vendor = await Vendor.create({ name: 'MedSupply Co', code: 'MSC' });
    const item = await InventoryItem.create({
      name: 'Surgical Gloves', code: 'GLV', category: 'CONSUMABLE',
      unit: 'BOX', minStock: 5, currentStock: 0, unitPrice: 200,
    });
    ctx = { vendor, item };
  });
});

const newPO = () => inventory.createPurchaseOrder({
  vendor: ctx.vendor._id,
  items: [{ item: ctx.item._id, quantity: 100, unitPrice: 200 }],
}, null);

// The ledger's view of stock on hand — must always match the item itself.
async function ledgerBalance(itemId) {
  const rows = await StockTransaction.find({ item: itemId });
  return rows.reduce((s, t) => s + t.quantity, 0);
}

describe('purchase order goods receipt', () => {
  it('stocks in the full order and closes it', () => inTenant(async () => {
    const po = await newPO();
    const received = await inventory.receivePurchaseOrder(po._id, {}, null);

    expect(received.status).toBe('RECEIVED');
    expect((await InventoryItem.findById(ctx.item._id)).currentStock).toBe(100);
    expect(await ledgerBalance(ctx.item._id)).toBe(100);
    expect((await InventoryItemBatch.findOne({ batchNo: po.poNo })).quantity).toBe(100);
  }));

  it('does not double-stock when two receipts race', () => inTenant(async () => {
    const po = await newPO();

    const results = await Promise.allSettled([
      inventory.receivePurchaseOrder(po._id, {}, null),
      inventory.receivePurchaseOrder(po._id, {}, null),
    ]);

    // One may fail outright or simply find nothing outstanding — either is
    // fine. What must not happen is 200 units on the shelf.
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    expect((await InventoryItem.findById(ctx.item._id)).currentStock).toBe(100);
    expect(await ledgerBalance(ctx.item._id)).toBe(100);
  }));

  it('folds partial receipts into one batch and tracks the outstanding balance', () => inTenant(async () => {
    const po = await newPO();

    const first = await inventory.receivePurchaseOrder(po._id, { items: [{ item: ctx.item._id, quantity: 40 }] }, null);
    expect(first.status).toBe('PARTIALLY_RECEIVED');
    expect((await InventoryItem.findById(ctx.item._id)).currentStock).toBe(40);

    const second = await inventory.receivePurchaseOrder(po._id, { items: [{ item: ctx.item._id, quantity: 60 }] }, null);
    expect(second.status).toBe('RECEIVED');

    expect((await InventoryItem.findById(ctx.item._id)).currentStock).toBe(100);
    expect(await InventoryItemBatch.countDocuments({ batchNo: po.poNo })).toBe(1);
    expect((await InventoryItemBatch.findOne({ batchNo: po.poNo })).quantity).toBe(100);
  }));

  it('never receives more than was ordered', () => inTenant(async () => {
    const po = await newPO();
    await inventory.receivePurchaseOrder(po._id, { items: [{ item: ctx.item._id, quantity: 500 }] }, null);

    expect((await InventoryItem.findById(ctx.item._id)).currentStock).toBe(100);
  }));

  it('rejects receiving a cancelled order', () => inTenant(async () => {
    const po = await newPO();
    await inventory.cancelPurchaseOrder(po._id);

    await expect(inventory.receivePurchaseOrder(po._id, {}, null))
      .rejects.toMatchObject({ errorCode: 'PO_CANCELLED' });
    expect((await InventoryItem.findById(ctx.item._id)).currentStock).toBe(0);
  }));
});

describe('inventory stock adjustments', () => {
  it('keeps concurrent adjustments from losing each other', () => inTenant(async () => {
    const po = await newPO();
    await inventory.receivePurchaseOrder(po._id, {}, null);

    await Promise.all([
      inventory.adjustStock(ctx.item._id, { type: 'OUT', quantity: 10, note: 'Issued' }, null),
      inventory.adjustStock(ctx.item._id, { type: 'OUT', quantity: 15, note: 'Issued' }, null),
      inventory.adjustStock(ctx.item._id, { type: 'IN', quantity: 5, note: 'Returned' }, null),
    ]);

    const after = await InventoryItem.findById(ctx.item._id);
    expect(after.currentStock).toBe(80); // 100 - 10 - 15 + 5
    expect(await ledgerBalance(ctx.item._id)).toBe(80);
  }));

  it('refuses a movement that would take stock negative', () => inTenant(async () => {
    await expect(inventory.adjustStock(ctx.item._id, { type: 'OUT', quantity: 5, note: 'Oops' }, null))
      .rejects.toMatchObject({ errorCode: 'NEGATIVE_STOCK' });

    expect((await InventoryItem.findById(ctx.item._id)).currentStock).toBe(0);
    expect(await StockTransaction.countDocuments({})).toBe(0); // no phantom ledger row
  }));
});
