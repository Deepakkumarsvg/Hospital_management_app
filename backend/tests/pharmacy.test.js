// Stock-integrity guarantees for the pharmacy.
//
// The invariant under test: Medicine.currentStock must always equal the sum of
// its batch quantities, and must never go negative — no matter how many
// dispenses, returns and adjustments overlap.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb, inTenant } from './helpers.js';

const { Medicine } = await import('../src/models/Medicine.js');
const { MedicineBatch } = await import('../src/models/MedicineBatch.js');
const { MedicineDispense } = await import('../src/models/MedicineDispense.js');
const pharmacy = await import('../src/services/pharmacyService.js');

let med;

beforeAll(async () => { await connectTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

const future = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

beforeEach(async () => {
  await inTenant(async () => {
    await Promise.all([Medicine.deleteMany({}), MedicineBatch.deleteMany({}), MedicineDispense.deleteMany({})]);
    med = await Medicine.create({
      name: 'Paracetamol 500', genericName: 'Paracetamol', category: 'Analgesic',
      unit: 'TABLET', minStock: 5, currentStock: 0, mrp: 2, purchasePrice: 1, sellingPrice: 2,
    });
  });
});

// Total units recorded against real batches — the ledger currentStock claims.
async function batchTotal(medicineId) {
  const rows = await MedicineBatch.find({ medicine: medicineId });
  return rows.reduce((s, b) => s + b.quantity, 0);
}

describe('pharmacy stock integrity', () => {
  it('never oversells when dispenses race for the last units', () => inTenant(async () => {
    await pharmacy.receiveBatch(med._id, { batchNo: 'B1', expiryDate: future(365), quantity: 10 }, null);

    // Three concurrent requests for 6 each, against 10 units in stock.
    const results = await Promise.allSettled([1, 2, 3].map(() =>
      pharmacy.dispense({ items: [{ medicine: med._id, quantity: 6 }] }, null)
    ));

    const ok = results.filter((r) => r.status === 'fulfilled');
    expect(ok).toHaveLength(1); // only one can be satisfied from 10 units
    for (const r of results.filter((r) => r.status === 'rejected')) {
      expect(r.reason.errorCode).toBe('INSUFFICIENT_STOCK');
    }

    const after = await Medicine.findById(med._id);
    expect(after.currentStock).toBe(4);
    expect(await batchTotal(med._id)).toBe(4); // ledger agrees with the aggregate
  }));

  it('draws FEFO — earliest expiry first, spanning batches', () => inTenant(async () => {
    await pharmacy.receiveBatch(med._id, { batchNo: 'LATE', expiryDate: future(365), quantity: 5 }, null);
    await pharmacy.receiveBatch(med._id, { batchNo: 'SOON', expiryDate: future(30), quantity: 4 }, null);

    const rec = await pharmacy.dispense({ items: [{ medicine: med._id, quantity: 6 }] }, null);

    const used = rec.items[0].batches.map((b) => ({ batchNo: b.batchNo, quantity: b.quantity }));
    expect(used).toEqual([{ batchNo: 'SOON', quantity: 4 }, { batchNo: 'LATE', quantity: 2 }]);
    expect((await MedicineBatch.findOne({ batchNo: 'SOON' })).quantity).toBe(0);
    expect((await MedicineBatch.findOne({ batchNo: 'LATE' })).quantity).toBe(3);
  }));

  it('rolls back earlier lines when a later line has no stock', () => inTenant(async () => {
    const other = await Medicine.create({
      name: 'Amoxicillin 250', genericName: 'Amoxicillin', category: 'Antibiotic',
      unit: 'CAPSULE', minStock: 5, currentStock: 0, mrp: 5, purchasePrice: 3, sellingPrice: 5,
    });
    await pharmacy.receiveBatch(med._id, { batchNo: 'B1', expiryDate: future(365), quantity: 10 }, null);
    await pharmacy.receiveBatch(other._id, { batchNo: 'B2', expiryDate: future(365), quantity: 1 }, null);

    await expect(pharmacy.dispense({
      items: [{ medicine: med._id, quantity: 5 }, { medicine: other._id, quantity: 99 }],
    }, null)).rejects.toMatchObject({ errorCode: 'INSUFFICIENT_STOCK' });

    // The first line must not have been quietly deducted.
    expect((await Medicine.findById(med._id)).currentStock).toBe(10);
    expect(await batchTotal(med._id)).toBe(10);
    expect(await MedicineDispense.countDocuments({})).toBe(0);
  }));

  it('refuses to dispense expired stock and leaves it untouched', () => inTenant(async () => {
    await MedicineBatch.create({
      medicine: med._id, batchNo: 'OLD', expiryDate: new Date('2020-01-01'),
      quantity: 20, receivedQuantity: 20, purchasePrice: 1, mrp: 2,
    });
    await Medicine.updateOne({ _id: med._id }, { currentStock: 20 });

    await expect(pharmacy.dispense({ items: [{ medicine: med._id, quantity: 5 }] }, null))
      .rejects.toMatchObject({ errorCode: 'INSUFFICIENT_BATCH_STOCK' });

    // The aggregate reservation must have been handed back.
    expect((await Medicine.findById(med._id)).currentStock).toBe(20);
    expect((await MedicineBatch.findOne({ batchNo: 'OLD' })).quantity).toBe(20);
  }));

  it('credits a return exactly once when two returns race', () => inTenant(async () => {
    await pharmacy.receiveBatch(med._id, { batchNo: 'B1', expiryDate: future(365), quantity: 10 }, null);
    const rec = await pharmacy.dispense({ items: [{ medicine: med._id, quantity: 4 }] }, null);

    const results = await Promise.allSettled([
      pharmacy.returnDispense(rec._id, null),
      pharmacy.returnDispense(rec._id, null),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected').reason.errorCode).toBe('ALREADY_RETURNED');

    expect((await Medicine.findById(med._id)).currentStock).toBe(10); // not 14
    expect(await batchTotal(med._id)).toBe(10);
  }));

  it('keeps concurrent adjustments from losing each other', () => inTenant(async () => {
    await pharmacy.receiveBatch(med._id, { batchNo: 'B1', expiryDate: future(365), quantity: 100 }, null);

    await Promise.all([
      pharmacy.adjustStock(med._id, { delta: -10, reason: 'Damaged' }, null),
      pharmacy.adjustStock(med._id, { delta: -15, reason: 'Expired' }, null),
      pharmacy.adjustStock(med._id, { delta: 5, reason: 'Recount' }, null),
    ]);

    const after = await Medicine.findById(med._id);
    expect(after.currentStock).toBe(80);            // 100 - 10 - 15 + 5
    expect(after.stockAdjustments).toHaveLength(3); // every correction is on record
    expect(await batchTotal(med._id)).toBe(80);
  }));

  it('refuses an adjustment that would cross zero', () => inTenant(async () => {
    await pharmacy.receiveBatch(med._id, { batchNo: 'B1', expiryDate: future(365), quantity: 3 }, null);

    await expect(pharmacy.adjustStock(med._id, { delta: -10, reason: 'Oops' }, null))
      .rejects.toMatchObject({ errorCode: 'STOCK_BELOW_ZERO' });

    expect((await Medicine.findById(med._id)).currentStock).toBe(3);
  }));
});
