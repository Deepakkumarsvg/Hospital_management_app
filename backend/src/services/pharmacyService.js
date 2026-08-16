import { Medicine } from '../models/Medicine.js';
import { MedicineBatch } from '../models/MedicineBatch.js';
import { MedicineDispense } from '../models/MedicineDispense.js';
import { Patient } from '../models/Patient.js';
import { Doctor } from '../models/Doctor.js';
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

  medicine.currentStock += data.quantity;
  await medicine.save();
  return batch;
}

// ---------- Dispense (FEFO stock reduction) ----------
export async function dispense(data, userId) {
  const lines = [];
  let total = 0;
  const lowStockMeds = [];

  for (const req of data.items) {
    const medicine = await Medicine.findById(req.medicine);
    if (!medicine) throw ApiError.badRequest(`Medicine not found`, 'MEDICINE_NOT_FOUND');
    if (medicine.currentStock < req.quantity) {
      throw ApiError.badRequest(`Insufficient stock for ${medicine.name} (have ${medicine.currentStock})`, 'INSUFFICIENT_STOCK');
    }

    // Draw from batches, earliest expiry first. Expired batches are excluded
    // — they must be written off via adjustStock, never handed to a patient.
    let need = req.quantity;
    const usedBatches = [];
    const batches = await MedicineBatch.find({ medicine: medicine._id, quantity: { $gt: 0 }, expiryDate: { $gte: new Date() } }).sort({ expiryDate: 1 });
    for (const b of batches) {
      if (need <= 0) break;
      const take = Math.min(b.quantity, need);
      b.quantity -= take;
      await b.save();
      usedBatches.push({ batchNo: b.batchNo, quantity: take });
      need -= take;
    }
    if (need > 0) {
      throw ApiError.badRequest(
        `Insufficient non-expired batch stock for ${medicine.name} — some stock may have expired. Write it off via Adjust Stock.`,
        'INSUFFICIENT_BATCH_STOCK'
      );
    }

    const wasLow = medicine.currentStock <= medicine.minStock;
    medicine.currentStock -= req.quantity;
    await medicine.save();
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
}

const DISPENSE_POPULATE = [
  { path: 'patient', select: 'uhid firstName lastName' },
  { path: 'doctor', select: 'firstName lastName specialization' },
  { path: 'dispensedBy', select: 'name' },
];

// Dispense no. is searchable directly, but patient/doctor are refs — resolve
// matching ids first so a name/UHID search actually finds records.
async function dispenseSearchFilter(search) {
  if (!search) return {};
  const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const [patients, doctors] = await Promise.all([
    Patient.find({ $or: [{ firstName: rx }, { lastName: rx }, { uhid: rx }] }).select('_id'),
    Doctor.find({ $or: [{ firstName: rx }, { lastName: rx }] }).select('_id'),
  ]);
  return {
    $or: [
      { dispenseNo: rx },
      { patient: { $in: patients.map((p) => p._id) } },
      { doctor: { $in: doctors.map((d) => d._id) } },
    ],
  };
}

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
export async function adjustStock(id, { delta, reason }, userId) {
  const m = await Medicine.findById(id);
  if (!m) throw ApiError.notFound('Medicine not found', 'MEDICINE_NOT_FOUND');
  const next = m.currentStock + delta;
  if (next < 0) {
    throw ApiError.badRequest(`Adjustment would take stock below zero (have ${m.currentStock})`, 'STOCK_BELOW_ZERO');
  }

  if (delta < 0) {
    let need = -delta;
    const batches = await MedicineBatch.find({ medicine: id, quantity: { $gt: 0 } }).sort({ expiryDate: 1 });
    for (const b of batches) {
      if (need <= 0) break;
      const take = Math.min(b.quantity, need);
      b.quantity -= take;
      await b.save();
      need -= take;
    }
    // Any shortfall vs. recorded batches just means the batch ledger was
    // already out of sync — currentStock (the field being corrected) stays
    // the source of truth either way.
  } else {
    await MedicineBatch.create({
      medicine: id,
      batchNo: `ADJ-${Date.now()}`,
      expiryDate: new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000), // unknown expiry — far default
      quantity: delta,
      receivedQuantity: delta,
      purchasePrice: m.purchasePrice,
      mrp: m.mrp,
      receivedBy: userId,
    });
  }

  m.currentStock = next;
  m.stockAdjustments.push({ delta, reason, by: userId });
  await m.save();
  return m;
}

// ---------- Return a dispense (patient hands back unused medicine) ----------
export async function returnDispense(id, userId) {
  const d = await MedicineDispense.findById(id);
  if (!d) throw ApiError.notFound('Dispense record not found', 'DISPENSE_NOT_FOUND');
  if (d.status === 'RETURNED') throw ApiError.badRequest('This dispense has already been returned', 'ALREADY_RETURNED');

  for (const item of d.items) {
    // Restore stock to the exact batches it was drawn from.
    for (const b of item.batches || []) {
      await MedicineBatch.updateOne({ medicine: item.medicine, batchNo: b.batchNo }, { $inc: { quantity: b.quantity } });
    }
    await Medicine.updateOne({ _id: item.medicine }, { $inc: { currentStock: item.quantity } });
  }

  d.status = 'RETURNED';
  d.returnedAt = new Date();
  d.returnedBy = userId;
  await d.save();
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
