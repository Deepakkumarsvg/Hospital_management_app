import { BloodDonor } from '../models/BloodDonor.js';
import { BloodUnit } from '../models/BloodUnit.js';
import { Patient } from '../models/Patient.js';
import { ApiError } from '../utils/ApiError.js';
import { isCompatible } from '../utils/bloodCompat.js';

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

// Units past their expiry date but still marked AVAILABLE/RESERVED are
// lazily flipped to EXPIRED whenever the unit list or stock is read, so the
// status shown is always accurate without needing a background job.
async function sweepExpired() {
  await BloodUnit.updateMany(
    { status: { $in: ['AVAILABLE', 'RESERVED'] }, expiryDate: { $lt: new Date() } },
    { status: 'EXPIRED' }
  );
}

const UNIT_POPULATE = [
  { path: 'donor', select: 'name' },
  { path: 'issuedTo', select: 'uhid firstName lastName' },
  { path: 'reservedFor', select: 'uhid firstName lastName' },
  { path: 'admission', select: 'admissionNo' },
];

// Units
export async function listUnits({ bloodGroup, component, status }) {
  await sweepExpired();
  const filter = {};
  if (bloodGroup && bloodGroup !== 'ALL') filter.bloodGroup = bloodGroup;
  if (component && component !== 'ALL') filter.component = component;
  if (status && status !== 'ALL') filter.status = status;
  // Soonest-to-expire first, so acting on the list top-to-bottom is FEFO.
  return BloodUnit.find(filter).populate(UNIT_POPULATE).sort({ expiryDate: 1 });
}

export async function getUnit(id) {
  const unit = await BloodUnit.findById(id).populate(UNIT_POPULATE).populate('createdBy', 'name').populate('issuedBy', 'name');
  if (!unit) throw ApiError.notFound('Unit not found', 'UNIT_NOT_FOUND');
  return unit;
}

export async function collectUnit(data, userId) {
  if (data.donor) {
    const donor = await BloodDonor.findById(data.donor);
    if (!donor) throw ApiError.badRequest('Donor does not exist', 'DONOR_NOT_FOUND');
    donor.lastDonation = data.collectionDate || new Date();
    donor.donationCount = (donor.donationCount || 0) + 1;
    await donor.save();
  }
  const unit = new BloodUnit({ ...data, createdBy: userId });
  await unit.save();
  return unit.populate('donor', 'name');
}

// Reserve a unit for a specific patient ahead of time, without issuing it yet.
export async function reserveUnit(id, patientId, userId) {
  const unit = await BloodUnit.findById(id);
  if (!unit) throw ApiError.notFound('Unit not found', 'UNIT_NOT_FOUND');
  if (unit.status !== 'AVAILABLE') throw ApiError.badRequest('Unit is not available', 'UNIT_NOT_AVAILABLE');
  if (unit.expiryDate < new Date()) throw ApiError.badRequest('Unit has expired', 'UNIT_EXPIRED');
  const patient = await Patient.findById(patientId).select('_id');
  if (!patient) throw ApiError.badRequest('Patient does not exist', 'PATIENT_NOT_FOUND');

  unit.status = 'RESERVED';
  unit.reservedFor = patientId;
  unit.reservedAt = new Date();
  await unit.save();
  return unit.populate(UNIT_POPULATE);
}

// Release a reservation, putting the unit back into available stock.
export async function unreserveUnit(id) {
  const unit = await BloodUnit.findById(id);
  if (!unit) throw ApiError.notFound('Unit not found', 'UNIT_NOT_FOUND');
  if (unit.status !== 'RESERVED') throw ApiError.badRequest('Unit is not reserved', 'UNIT_NOT_RESERVED');
  unit.status = 'AVAILABLE';
  unit.reservedFor = null;
  unit.reservedAt = null;
  await unit.save();
  return unit.populate(UNIT_POPULATE);
}

export async function issueUnit(id, opts, userId) {
  const { patient: patientId, admission, reason, chargeAmount, overrideCompatibility } = opts;
  const unit = await BloodUnit.findById(id);
  if (!unit) throw ApiError.notFound('Unit not found', 'UNIT_NOT_FOUND');
  if (unit.status !== 'AVAILABLE' && !(unit.status === 'RESERVED' && String(unit.reservedFor) === String(patientId))) {
    throw ApiError.badRequest('Unit is not available for this patient', 'UNIT_NOT_AVAILABLE');
  }
  if (unit.expiryDate < new Date()) throw ApiError.badRequest('Unit has expired', 'UNIT_EXPIRED');
  const patient = await Patient.findById(patientId).select('bloodGroup');
  if (!patient) throw ApiError.badRequest('Patient does not exist', 'PATIENT_NOT_FOUND');

  const compatible = isCompatible(unit.bloodGroup, patient.bloodGroup);
  if (!compatible && !overrideCompatibility) {
    throw ApiError.badRequest(
      `${unit.bloodGroup} is not compatible with recipient's blood group (${patient.bloodGroup}). Re-confirm and override if this is intentional.`,
      'INCOMPATIBLE_BLOOD_GROUP'
    );
  }

  unit.status = 'ISSUED';
  unit.issuedTo = patientId;
  unit.issuedAt = new Date();
  unit.issuedBy = userId;
  unit.reservedFor = null;
  unit.reservedAt = null;
  unit.admission = admission || null;
  unit.reason = reason || '';
  unit.chargeAmount = chargeAmount || 0;
  await unit.save();
  return unit.populate(UNIT_POPULATE);
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
  await sweepExpired();
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
