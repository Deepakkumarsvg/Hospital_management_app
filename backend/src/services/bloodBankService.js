import { BloodDonor } from '../models/BloodDonor.js';
import { BloodUnit } from '../models/BloodUnit.js';
import { Patient } from '../models/Patient.js';
import { ApiError } from '../utils/ApiError.js';

// Donors
export const listDonors = () => BloodDonor.find().sort({ name: 1 });
export const createDonor = (data) => BloodDonor.create(data);
export async function updateDonor(id, data) {
  const d = await BloodDonor.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!d) throw ApiError.notFound('Donor not found', 'DONOR_NOT_FOUND');
  return d;
}
export async function deleteDonor(id) {
  const d = await BloodDonor.findByIdAndDelete(id);
  if (!d) throw ApiError.notFound('Donor not found', 'DONOR_NOT_FOUND');
  return d;
}

// Units
export async function listUnits({ bloodGroup, component, status }) {
  const filter = {};
  if (bloodGroup && bloodGroup !== 'ALL') filter.bloodGroup = bloodGroup;
  if (component && component !== 'ALL') filter.component = component;
  if (status && status !== 'ALL') filter.status = status;
  return BloodUnit.find(filter).populate('donor', 'name').populate('issuedTo', 'uhid firstName lastName').sort({ expiryDate: 1 });
}

export async function collectUnit(data, userId) {
  if (data.donor) {
    const donor = await BloodDonor.findById(data.donor);
    if (!donor) throw ApiError.badRequest('Donor does not exist', 'DONOR_NOT_FOUND');
    donor.lastDonation = data.collectionDate || new Date();
    await donor.save();
  }
  const unit = new BloodUnit({ ...data, createdBy: userId });
  await unit.save();
  return unit.populate('donor', 'name');
}

export async function issueUnit(id, patientId, userId) {
  const unit = await BloodUnit.findById(id);
  if (!unit) throw ApiError.notFound('Unit not found', 'UNIT_NOT_FOUND');
  if (unit.status !== 'AVAILABLE') throw ApiError.badRequest('Unit is not available', 'UNIT_NOT_AVAILABLE');
  if (unit.expiryDate < new Date()) throw ApiError.badRequest('Unit has expired', 'UNIT_EXPIRED');
  const patient = await Patient.findById(patientId).select('_id');
  if (!patient) throw ApiError.badRequest('Patient does not exist', 'PATIENT_NOT_FOUND');

  unit.status = 'ISSUED';
  unit.issuedTo = patientId;
  unit.issuedAt = new Date();
  unit.issuedBy = userId;
  await unit.save();
  return unit.populate([{ path: 'issuedTo', select: 'uhid firstName lastName' }, { path: 'donor', select: 'name' }]);
}

export async function discardUnit(id) {
  const unit = await BloodUnit.findById(id);
  if (!unit) throw ApiError.notFound('Unit not found', 'UNIT_NOT_FOUND');
  if (unit.status === 'ISSUED') throw ApiError.badRequest('Cannot discard an issued unit', 'UNIT_ISSUED');
  unit.status = 'DISCARDED';
  await unit.save();
  return unit;
}

// Stock summary grouped by blood group (available only).
export async function stock() {
  const now = new Date();
  const rows = await BloodUnit.aggregate([
    { $match: { status: 'AVAILABLE', expiryDate: { $gt: now } } },
    { $group: { _id: { group: '$bloodGroup', component: '$component' }, count: { $sum: 1 } } },
  ]);
  const byGroup = {};
  for (const r of rows) {
    byGroup[r._id.group] = byGroup[r._id.group] || { total: 0, components: {} };
    byGroup[r._id.group].total += r.count;
    byGroup[r._id.group].components[r._id.component] = r.count;
  }
  const [donors, expiringSoon] = await Promise.all([
    BloodDonor.countDocuments({}),
    BloodUnit.countDocuments({ status: 'AVAILABLE', expiryDate: { $gt: now, $lte: new Date(now.getTime() + 7 * 24 * 3600 * 1000) } }),
  ]);
  const totalAvailable = rows.reduce((s, r) => s + r.count, 0);
  return { byGroup, donors, expiringSoon, totalAvailable };
}
