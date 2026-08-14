import { Medicine } from '../models/Medicine.js';
import { MedicineBatch } from '../models/MedicineBatch.js';
import { MedicineDispense } from '../models/MedicineDispense.js';
import { ApiError } from '../utils/ApiError.js';

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
  const m = await Medicine.findByIdAndDelete(id);
  if (!m) throw ApiError.notFound('Medicine not found', 'MEDICINE_NOT_FOUND');
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

  for (const req of data.items) {
    const medicine = await Medicine.findById(req.medicine);
    if (!medicine) throw ApiError.badRequest(`Medicine not found`, 'MEDICINE_NOT_FOUND');
    if (medicine.currentStock < req.quantity) {
      throw ApiError.badRequest(`Insufficient stock for ${medicine.name} (have ${medicine.currentStock})`, 'INSUFFICIENT_STOCK');
    }

    // Draw from batches, earliest expiry first.
    let need = req.quantity;
    const usedBatches = [];
    const batches = await MedicineBatch.find({ medicine: medicine._id, quantity: { $gt: 0 } }).sort({ expiryDate: 1 });
    for (const b of batches) {
      if (need <= 0) break;
      const take = Math.min(b.quantity, need);
      b.quantity -= take;
      await b.save();
      usedBatches.push({ batchNo: b.batchNo, quantity: take });
      need -= take;
    }
    if (need > 0) throw ApiError.badRequest(`Insufficient batch stock for ${medicine.name}`, 'INSUFFICIENT_BATCH_STOCK');

    medicine.currentStock -= req.quantity;
    await medicine.save();

    const lineTotal = medicine.sellingPrice * req.quantity;
    total += lineTotal;
    lines.push({ medicine: medicine._id, name: medicine.name, quantity: req.quantity, sellingPrice: medicine.sellingPrice, lineTotal, batches: usedBatches });
  }

  const record = new MedicineDispense({
    patient: data.patient || null, opdVisit: data.opdVisit || null,
    items: lines, total, dispensedBy: userId,
  });
  await record.save();
  return record.populate([{ path: 'patient', select: 'uhid firstName lastName' }]);
}

export async function listDispenses({ page, limit, patient }) {
  const filter = {};
  if (patient) filter.patient = patient;
  const [items, total] = await Promise.all([
    MedicineDispense.find(filter).populate('patient', 'uhid firstName lastName').populate('dispensedBy', 'name').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    MedicineDispense.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
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
