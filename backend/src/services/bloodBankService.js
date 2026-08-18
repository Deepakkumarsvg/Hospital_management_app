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

// Units past their expiry date but still marked AVAILABLE/RESERVED are flipped
// to EXPIRED by the hourly scheduler (see services/scheduler.js).
//
// This used to run on every list/stock read. A write on a read path is worth
// avoiding on its own — it makes reads non-idempotent and puts an oplog entry
// behind every page load — but the sweep was never what made the numbers
// right either: the queries below exclude expired units by date, so they are
// correct in the gap between sweeps regardless of when it last ran.
export async function sweepExpiredUnits() {
  const res = await BloodUnit.updateMany(
    { status: { $in: ['AVAILABLE', 'RESERVED'] }, expiryDate: { $lt: new Date() } },
    { status: 'EXPIRED' }
  );
  return { expired: res.modifiedCount || 0 };
}

// A unit is only really available if it is both marked AVAILABLE and still in
// date. Expressing that as a filter — rather than trusting the stored status —
// is what lets the sweep move off the read path.
const IN_DATE = () => ({ $gt: new Date() });

// Translate a requested status into a filter that accounts for units whose
// stored status has not been swept yet.
function statusFilter(status) {
  const now = new Date();
  if (!status || status === 'ALL') return {};
  if (status === 'AVAILABLE' || status === 'RESERVED') {
    return { status, expiryDate: { $gt: now } };
  }
  if (status === 'EXPIRED') {
    // Both already-swept units and ones that are past their date but still
    // carry their old status.
    return {
      $or: [
        { status: 'EXPIRED' },
        { status: { $in: ['AVAILABLE', 'RESERVED'] }, expiryDate: { $lte: now } },
      ],
    };
  }
  // ISSUED / DISCARDED are terminal — expiry doesn't reinterpret them.
  return { status };
}

const UNIT_POPULATE = [
  { path: 'donor', select: 'name' },
  { path: 'issuedTo', select: 'uhid firstName lastName' },
  { path: 'reservedFor', select: 'uhid firstName lastName' },
  { path: 'admission', select: 'admissionNo' },
];

// Units
export async function listUnits({ bloodGroup, component, status }) {
  const filter = { ...statusFilter(status) };
  if (bloodGroup && bloodGroup !== 'ALL') filter.bloodGroup = bloodGroup;
  if (component && component !== 'ALL') filter.component = component;
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

// Nothing was claimed — work out *why*, so the caller gets a useful message
// rather than a bare "not available". Shared by every guarded transition below.
async function explainClaimFailure(id, { expectReserved = false } = {}) {
  const unit = await BloodUnit.findById(id).select('status expiryDate reservedFor');
  if (!unit) throw ApiError.notFound('Unit not found', 'UNIT_NOT_FOUND');
  if (unit.expiryDate < new Date()) throw ApiError.badRequest('Unit has expired', 'UNIT_EXPIRED');
  if (expectReserved && unit.status !== 'RESERVED') {
    throw ApiError.badRequest('Unit is not reserved', 'UNIT_NOT_RESERVED');
  }
  throw ApiError.conflict(`Unit is no longer available (${unit.status.toLowerCase()})`, 'UNIT_NOT_AVAILABLE');
}

// Reserve a unit for a specific patient ahead of time, without issuing it yet.
//
// The status check and the write happen in one findOneAndUpdate, so two nurses
// reserving at the same moment can never both win the same unit — the loser
// gets null back and is told it is gone. Same shape as claimBed() in the IPD
// service.
export async function reserveUnit(id, patientId, _userId) {
  const patient = await Patient.findById(patientId).select('_id');
  if (!patient) throw ApiError.badRequest('Patient does not exist', 'PATIENT_NOT_FOUND');

  const unit = await BloodUnit.findOneAndUpdate(
    { _id: id, status: 'AVAILABLE', expiryDate: IN_DATE() },
    { status: 'RESERVED', reservedFor: patientId, reservedAt: new Date() },
    { new: true }
  );
  if (!unit) await explainClaimFailure(id);
  return unit.populate(UNIT_POPULATE);
}

// Release a reservation, putting the unit back into available stock.
export async function unreserveUnit(id) {
  const unit = await BloodUnit.findOneAndUpdate(
    { _id: id, status: 'RESERVED' },
    { status: 'AVAILABLE', reservedFor: null, reservedAt: null },
    { new: true }
  );
  if (!unit) await explainClaimFailure(id, { expectReserved: true });
  return unit.populate(UNIT_POPULATE);
}

export async function issueUnit(id, opts, userId) {
  const { patient: patientId, admission, reason, chargeAmount, overrideCompatibility } = opts;

  // Read first only to validate compatibility — bloodGroup never changes, so
  // this cannot go stale between here and the claim below.
  const [unit, patient] = await Promise.all([
    BloodUnit.findById(id).select('bloodGroup'),
    Patient.findById(patientId).select('bloodGroup'),
  ]);
  if (!unit) throw ApiError.notFound('Unit not found', 'UNIT_NOT_FOUND');
  if (!patient) throw ApiError.badRequest('Patient does not exist', 'PATIENT_NOT_FOUND');

  if (!isCompatible(unit.bloodGroup, patient.bloodGroup) && !overrideCompatibility) {
    throw ApiError.badRequest(
      `${unit.bloodGroup} is not compatible with recipient's blood group (${patient.bloodGroup}). Re-confirm and override if this is intentional.`,
      'INCOMPATIBLE_BLOOD_GROUP'
    );
  }

  // A unit can be issued if it is free, or if it was reserved for this very
  // patient. Both preconditions live in the query so the unit can only ever be
  // handed to one recipient.
  const issued = await BloodUnit.findOneAndUpdate(
    {
      _id: id,
      expiryDate: IN_DATE(),
      $or: [
        { status: 'AVAILABLE' },
        { status: 'RESERVED', reservedFor: patientId },
      ],
    },
    {
      status: 'ISSUED',
      issuedTo: patientId,
      issuedAt: new Date(),
      issuedBy: userId,
      reservedFor: null,
      reservedAt: null,
      admission: admission || null,
      reason: reason || '',
      chargeAmount: chargeAmount || 0,
    },
    { new: true }
  );
  if (!issued) await explainClaimFailure(id);
  return issued.populate(UNIT_POPULATE);
}

export async function discardUnit(id) {
  // An issued unit has left the bank — it must not be discardable, and that
  // rule belongs in the query so a discard racing an issue always loses.
  const unit = await BloodUnit.findOneAndUpdate(
    { _id: id, status: { $ne: 'ISSUED' } },
    { status: 'DISCARDED' },
    { new: true }
  );
  if (!unit) {
    const exists = await BloodUnit.exists({ _id: id });
    if (!exists) throw ApiError.notFound('Unit not found', 'UNIT_NOT_FOUND');
    throw ApiError.badRequest('Cannot discard an issued unit', 'UNIT_ISSUED');
  }
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
