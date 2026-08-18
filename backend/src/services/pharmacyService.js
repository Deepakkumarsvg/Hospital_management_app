import { buildSearchFilter } from './searchFilters.js';
import { Medicine } from '../models/Medicine.js';
import { MedicineBatch } from '../models/MedicineBatch.js';
import { MedicineDispense } from '../models/MedicineDispense.js';
import { ApiError } from '../utils/ApiError.js';
import { notify } from './notificationService.js';

// ---------- Medicine master ----------
export async function listMedicines({ page, limit, search, status, lowStock }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { genericName: rx }, { category: rx }, { manufacturer: rx }];
  }
  if (lowStock === 'true') filter.$expr = { $lte: ['$currentStock', '$minStock'] };

  const [items, total] = await Promise.all([
    Medicine.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit),
    Medicine.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}
export const activeMedicines = () => Medicine.find({ status: 'ACTIVE' }).sort({ name: 1 });
export const createMedicine = (data) => Medicine.create(data);
export async function getMedicine(id) {
  const m = await Medicine.findById(id);
  if (!m) throw ApiError.notFound('Medicine not found', 'MEDICINE_NOT_FOUND');
  const batches = await MedicineBatch.find({ medicine: id, quantity: { $gt: 0 } }).sort({ expiryDate: 1 });
  return { medicine: m, batches };
}
export async function updateMedicine(id, data) {
  const m = await Medicine.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!m) throw ApiError.notFound('Medicine not found', 'MEDICINE_NOT_FOUND');
  return m;
}
export async function deleteMedicine(id) {
  const m = await Medicine.findById(id);
  if (!m) throw ApiError.notFound('Medicine not found', 'MEDICINE_NOT_FOUND');

  const dispenseCount = await MedicineDispense.countDocuments({ 'items.medicine': id });
  if (dispenseCount) {
    throw ApiError.conflict(
      'This medicine has been dispensed before and cannot be deleted. Set its status to Inactive instead.',
      'MEDICINE_HAS_HISTORY',
      { dispenses: dispenseCount }
    );
  }
  if (m.currentStock > 0) {
    throw ApiError.conflict(
      `This medicine still has ${m.currentStock} unit(s) in stock. Adjust or dispense it to zero before deleting.`,
      'MEDICINE_HAS_STOCK',
      { currentStock: m.currentStock }
    );
  }

  await Medicine.findByIdAndDelete(id);
  await MedicineBatch.deleteMany({ medicine: id });
  return m;
}

// ---------- Batches (goods receipt) ----------
export async function receiveBatch(medicineId, data, userId) {
  const medicine = await Medicine.findById(medicineId);
  if (!medicine) throw ApiError.notFound('Medicine not found', 'MEDICINE_NOT_FOUND');

  const batch = await MedicineBatch.create({
    medicine: medicineId,
    batchNo: data.batchNo,
    expiryDate: data.expiryDate,
    quantity: data.quantity,
    receivedQuantity: data.quantity,
    purchasePrice: data.purchasePrice ?? medicine.purchasePrice,
    mrp: data.mrp ?? medicine.mrp,
    receivedBy: userId,
  });

  // $inc rather than save() — a goods receipt landing at the same time as a
  // dispense must add to whatever the stock is *now*, not to the value read
  // at the top of this function.
  await Medicine.updateOne({ _id: medicineId }, { $inc: { currentStock: data.quantity } });
  return batch;
}

// ---------- Dispense (FEFO stock reduction) ----------

// Draw `quantity` units from real batches, earliest expiry first. Expired
// batches are excluded — they must be written off via adjustStock, never
// handed to a patient.
//
// Each batch is decremented with a conditional $inc rather than a read-modify-
// write, so a concurrent dispense can never push a batch negative. Losing the
// race on one batch is normal, not an error: we re-read and move to the next
// one. Every successful decrement pushes its own undo onto `undo`.
async function drawFromBatches(medicine, quantity, undo) {
  const taken = new Map(); // batchNo -> units, merged across retries
  let need = quantity;

  for (let attempt = 0; attempt < 5 && need > 0; attempt += 1) {
    const batches = await MedicineBatch.find({
      medicine: medicine._id,
      quantity: { $gt: 0 },
      expiryDate: { $gte: new Date() },
    }).sort({ expiryDate: 1 });
    if (!batches.length) break;

    let progressed = false;
    for (const b of batches) {
      if (need <= 0) break;
      const take = Math.min(b.quantity, need);
      const res = await MedicineBatch.updateOne(
        { _id: b._id, quantity: { $gte: take } },
        { $inc: { quantity: -take } }
      );
      if (!res.modifiedCount) continue; // someone else got there first — re-read

      undo.push(() => MedicineBatch.updateOne({ _id: b._id }, { $inc: { quantity: take } }));
      taken.set(b.batchNo, (taken.get(b.batchNo) || 0) + take);
      need -= take;
      progressed = true;
    }
    if (!progressed) break; // no batch could be drawn from at all
  }

  if (need > 0) {
    throw ApiError.conflict(
      `Insufficient non-expired batch stock for ${medicine.name} — some stock may have expired. Write it off via Adjust Stock.`,
      'INSUFFICIENT_BATCH_STOCK'
    );
  }
  return [...taken].map(([batchNo, qty]) => ({ batchNo, quantity: qty }));
}

export async function dispense(data, userId) {
  const lines = [];
  let total = 0;
  const lowStockMeds = [];
  // Compensating actions for everything already written, newest first. Without
  // this, a failure on the third line would leave the first two permanently
  // deducted with no dispense record to show for it.
  const undo = [];

  try {
    for (const req of data.items) {
      // Reserve the aggregate stock in a single conditional update — this is
      // the gate that makes overselling impossible. A read-then-check would
      // let two concurrent dispenses both see enough stock and both proceed.
      const medicine = await Medicine.findOneAndUpdate(
        { _id: req.medicine, currentStock: { $gte: req.quantity } },
        { $inc: { currentStock: -req.quantity } },
        { new: true }
      );
      if (!medicine) {
        const existing = await Medicine.findById(req.medicine).select('name currentStock');
        if (!existing) throw ApiError.badRequest('Medicine not found', 'MEDICINE_NOT_FOUND');
        throw ApiError.conflict(
          `Insufficient stock for ${existing.name} (have ${existing.currentStock})`,
          'INSUFFICIENT_STOCK'
        );
      }
      undo.push(() => Medicine.updateOne({ _id: medicine._id }, { $inc: { currentStock: req.quantity } }));

      const usedBatches = await drawFromBatches(medicine, req.quantity, undo);

      // currentStock is already post-decrement, so the "before" value is
      // whatever we just took back off it.
      const wasLow = medicine.currentStock + req.quantity <= medicine.minStock;
      if (!wasLow && medicine.currentStock <= medicine.minStock) lowStockMeds.push(medicine);

      const lineTotal = medicine.sellingPrice * req.quantity;
      total += lineTotal;
      lines.push({ medicine: medicine._id, name: medicine.name, quantity: req.quantity, sellingPrice: medicine.sellingPrice, lineTotal, batches: usedBatches });
    }

    const record = new MedicineDispense({
      patient: data.patient || null, doctor: data.doctor || null, opdVisit: data.opdVisit || null,
      items: lines, total, dispensedBy: userId,
    });
    await record.save();

    for (const medicine of lowStockMeds) {
      notify({
        role: 'PHARMACIST', type: 'PHARMACY', title: 'Low stock alert',
        message: `${medicine.name} is down to ${medicine.currentStock} unit(s) (min ${medicine.minStock}) — reorder soon.`,
        link: '/pharmacy',
      });
    }

    return record.populate([{ path: 'patient', select: 'uhid firstName lastName' }, { path: 'doctor', select: 'firstName lastName' }]);
  } catch (err) {
    // Put every deducted unit back, in reverse order of how it was taken.
    for (const revert of undo.reverse()) await revert().catch(() => {});
    throw err;
  }
}

const DISPENSE_POPULATE = [
  { path: 'patient', select: 'uhid firstName lastName' },
  { path: 'doctor', select: 'firstName lastName specialization' },
  { path: 'dispensedBy', select: 'name' },
];

// Dispense no. is searchable directly, but patient/doctor are refs — the
// shared helper resolves those, with a cap so a broad term cannot pull the
// whole patient list into memory. See services/searchFilters.js.
const dispenseSearchFilter = (search) =>
  buildSearchFilter(search, ['dispenseNo'], { patient: true, doctor: true });

export async function listDispenses({ page, limit, search, patient, doctor }) {
  const filter = {};
  if (patient) filter.patient = patient;
  if (doctor) filter.doctor = doctor;
  Object.assign(filter, await dispenseSearchFilter(search));

  const [items, total] = await Promise.all([
    MedicineDispense.find(filter).populate(DISPENSE_POPULATE).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    MedicineDispense.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function getDispense(id) {
  const d = await MedicineDispense.findById(id).populate(DISPENSE_POPULATE);
  if (!d) throw ApiError.notFound('Dispense record not found', 'DISPENSE_NOT_FOUND');
  return d;
}

// Flat rows for CSV/XLSX export.
export async function medicineRowsForExport({ search, status, lowStock }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { genericName: rx }, { category: rx }, { manufacturer: rx }];
  }
  if (lowStock === 'true') filter.$expr = { $lte: ['$currentStock', '$minStock'] };

  const items = await Medicine.find(filter).sort({ name: 1 });
  return items.map((m) => ({
    Name: m.name,
    'Generic Name': m.genericName,
    Category: m.category,
    Manufacturer: m.manufacturer,
    Unit: m.unit,
    'Current Stock': m.currentStock,
    'Min Stock': m.minStock,
    MRP: m.mrp,
    'Purchase Price': m.purchasePrice,
    'Selling Price': m.sellingPrice,
    Status: m.status,
  }));
}

export async function dispenseRowsForExport({ search, patient, doctor }) {
  const filter = {};
  if (patient) filter.patient = patient;
  if (doctor) filter.doctor = doctor;
  Object.assign(filter, await dispenseSearchFilter(search));

  const items = await MedicineDispense.find(filter).populate(DISPENSE_POPULATE).sort({ createdAt: -1 });
  return items.map((d) => ({
    'Dispense No': d.dispenseNo,
    Patient: d.patient ? `${d.patient.firstName} ${d.patient.lastName || ''}`.trim() : 'Walk-in',
    Doctor: d.doctor ? `${d.doctor.firstName} ${d.doctor.lastName || ''}`.trim() : '',
    Items: (d.items || []).map((i) => `${i.name} x${i.quantity}`).join(', '),
    Total: d.total,
    'Dispensed By': d.dispensedBy?.name || '',
    Date: d.createdAt ? d.createdAt.toISOString().slice(0, 10) : '',
  }));
}

// ---------- Manual stock adjustment (damage/loss/count correction) ----------
// Keeps MedicineBatch quantities in sync with the aggregate currentStock so
// the batch-view (and FEFO dispensing) never drifts from what's recorded
// here: a negative delta draws down real batches FEFO, a positive one is
// recorded as its own "correction" batch so the sum still adds up.
export async function adjustStock(id, { delta, reason, batchNo, expiryDate }, userId) {
  // Stock being added must land in a real, dated batch. Work out which one
  // BEFORE touching currentStock — this used to invent a batch with a made-up
  // two-year expiry, which put undatable stock into the FEFO queue and quietly
  // corrupted every expiry report that counted on those dates being real.
  let targetBatch = null;
  if (delta > 0) {
    targetBatch = await MedicineBatch.findOne({ medicine: id, batchNo });
    if (!targetBatch && !expiryDate) {
      throw ApiError.badRequest(
        `Batch "${batchNo}" is not on record for this medicine — supply its expiry date to open it.`,
        'BATCH_EXPIRY_REQUIRED'
      );
    }
    if (targetBatch && targetBatch.expiryDate < new Date()) {
      throw ApiError.badRequest(
        `Batch "${batchNo}" expired on ${targetBatch.expiryDate.toISOString().slice(0, 10)} — expired stock cannot be added back.`,
        'BATCH_EXPIRED'
      );
    }
    if (!targetBatch && new Date(expiryDate) < new Date()) {
      throw ApiError.badRequest('Cannot open a batch that has already expired', 'BATCH_EXPIRED');
    }
  }

  // Apply the delta conditionally so two concurrent adjustments can't lose
  // each other's write, and a negative one can never cross zero.
  const filter = delta < 0 ? { _id: id, currentStock: { $gte: -delta } } : { _id: id };
  const m = await Medicine.findOneAndUpdate(
    filter,
    {
      $inc: { currentStock: delta },
      $push: { stockAdjustments: { delta, reason, by: userId } },
    },
    { new: true }
  );
  if (!m) {
    const existing = await Medicine.findById(id).select('currentStock');
    if (!existing) throw ApiError.notFound('Medicine not found', 'MEDICINE_NOT_FOUND');
    throw ApiError.badRequest(
      `Adjustment would take stock below zero (have ${existing.currentStock})`,
      'STOCK_BELOW_ZERO'
    );
  }

  if (delta < 0) {
    let need = -delta;
    const batches = await MedicineBatch.find({ medicine: id, quantity: { $gt: 0 } }).sort({ expiryDate: 1 });
    for (const b of batches) {
      if (need <= 0) break;
      const take = Math.min(b.quantity, need);
      const res = await MedicineBatch.updateOne({ _id: b._id, quantity: { $gte: take } }, { $inc: { quantity: -take } });
      if (res.modifiedCount) need -= take;
    }
    // Any shortfall vs. recorded batches just means the batch ledger was
    // already out of sync — currentStock (the field being corrected) stays
    // the source of truth either way.
  } else if (targetBatch) {
    await MedicineBatch.updateOne(
      { _id: targetBatch._id },
      { $inc: { quantity: delta, receivedQuantity: delta } }
    );
  } else {
    await MedicineBatch.create({
      medicine: id,
      batchNo,
      expiryDate,
      quantity: delta,
      receivedQuantity: delta,
      purchasePrice: m.purchasePrice,
      mrp: m.mrp,
      receivedBy: userId,
    });
  }

  return m;
}

// ---------- Return a dispense (patient hands back unused medicine) ----------
export async function returnDispense(id, userId) {
  // Flip the status first, conditionally: whoever wins gets to restore the
  // stock exactly once. A read-then-check would let two concurrent returns
  // both credit the stock back.
  const d = await MedicineDispense.findOneAndUpdate(
    { _id: id, status: { $ne: 'RETURNED' } },
    { status: 'RETURNED', returnedAt: new Date(), returnedBy: userId },
    { new: true }
  );
  if (!d) {
    const exists = await MedicineDispense.exists({ _id: id });
    if (!exists) throw ApiError.notFound('Dispense record not found', 'DISPENSE_NOT_FOUND');
    throw ApiError.badRequest('This dispense has already been returned', 'ALREADY_RETURNED');
  }

  for (const item of d.items) {
    // Restore stock to the exact batches it was drawn from.
    for (const b of item.batches || []) {
      await MedicineBatch.updateOne({ medicine: item.medicine, batchNo: b.batchNo }, { $inc: { quantity: b.quantity } });
    }
    await Medicine.updateOne({ _id: item.medicine }, { $inc: { currentStock: item.quantity } });
  }

  return d.populate(DISPENSE_POPULATE);
}

// ---------- Alerts / stats ----------
export async function expiringBatches(days = 90) {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + days);
  return MedicineBatch.find({ quantity: { $gt: 0 }, expiryDate: { $lte: cutoff } })
    .populate('medicine', 'name unit').sort({ expiryDate: 1 });
}

export async function pharmacyStats() {
  const now = new Date();
  const soon = new Date(); soon.setDate(soon.getDate() + 90);
  const [totalMeds, lowStock, expiringSoon, expired] = await Promise.all([
    Medicine.countDocuments({ status: 'ACTIVE' }),
    Medicine.countDocuments({ $expr: { $lte: ['$currentStock', '$minStock'] }, status: 'ACTIVE' }),
    MedicineBatch.countDocuments({ quantity: { $gt: 0 }, expiryDate: { $gt: now, $lte: soon } }),
    MedicineBatch.countDocuments({ quantity: { $gt: 0 }, expiryDate: { $lte: now } }),
  ]);
  return { totalMeds, lowStock, expiringSoon, expired };
}
