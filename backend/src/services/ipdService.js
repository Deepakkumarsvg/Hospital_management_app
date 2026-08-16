import { IPDAdmission } from '../models/IPDAdmission.js';
import { Bed } from '../models/Bed.js';
import { Patient } from '../models/Patient.js';
import { Doctor } from '../models/Doctor.js';
import { ApiError } from '../utils/ApiError.js';

const POPULATE = [
  { path: 'patient', select: 'uhid firstName lastName phone gender dateOfBirth' },
  { path: 'admittingDoctor', select: 'firstName lastName specialization' },
  { path: 'department', select: 'name code' },
  { path: 'ward', select: 'name code type' },
  { path: 'room', select: 'roomNo' },
  { path: 'bed', select: 'bedNo dailyCharge status' },
  { path: 'nursingNotes.by', select: 'name role' },
];

// Admission number is searchable directly, but patient/doctor are refs —
// resolve matching ids first so a name/UHID search actually finds admissions.
async function searchFilter(search) {
  if (!search) return {};
  const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const [patients, doctors] = await Promise.all([
    Patient.find({ $or: [{ firstName: rx }, { lastName: rx }, { uhid: rx }] }).select('_id'),
    Doctor.find({ $or: [{ firstName: rx }, { lastName: rx }] }).select('_id'),
  ]);
  return {
    $or: [
      { admissionNo: rx },
      { patient: { $in: patients.map((p) => p._id) } },
      { admittingDoctor: { $in: doctors.map((d) => d._id) } },
    ],
  };
}

export async function listAdmissions({ page, limit, search, status, patient }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (patient) filter.patient = patient;
  Object.assign(filter, await searchFilter(search));

  const [items, total] = await Promise.all([
    IPDAdmission.find(filter).populate(POPULATE).sort({ admissionDate: -1 }).skip((page - 1) * limit).limit(limit),
    IPDAdmission.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function getAdmission(id) {
  const adm = await IPDAdmission.findById(id).populate(POPULATE);
  if (!adm) throw ApiError.notFound('Admission not found', 'IPD_NOT_FOUND');
  return adm;
}

// Claim a bed atomically. The status check and the write happen in one
// findOneAndUpdate, so two concurrent admissions can never both win the same
// bed — the loser gets null back and is told the bed is taken.
async function claimBed(bedId, admissionId = null) {
  const bed = await Bed.findOneAndUpdate(
    { _id: bedId, status: 'AVAILABLE' },
    { status: 'OCCUPIED', currentAdmission: admissionId },
    { new: true }
  );
  if (bed) return bed;

  // Nothing was claimed — say *why*, so the caller sees a useful message.
  const exists = await Bed.exists({ _id: bedId });
  if (!exists) throw ApiError.badRequest('Bed does not exist', 'BED_NOT_FOUND');
  throw ApiError.conflict('Bed is no longer available', 'BED_UNAVAILABLE');
}

// Release a bed, but only if it is still held by *this* admission. Guards
// against a stale discharge freeing a bed that has since been given to
// somebody else.
function releaseBed(bedId, admissionId) {
  return Bed.updateOne(
    { _id: bedId, currentAdmission: admissionId },
    { status: 'AVAILABLE', currentAdmission: null }
  );
}

export async function admitPatient(data, userId) {
  const [patient, doctor] = await Promise.all([
    Patient.findById(data.patient).select('_id'),
    Doctor.findById(data.admittingDoctor).select('_id'),
  ]);
  if (!patient) throw ApiError.badRequest('Patient does not exist', 'PATIENT_NOT_FOUND');
  if (!doctor) throw ApiError.badRequest('Doctor does not exist', 'DOCTOR_NOT_FOUND');

  // A patient can only be in one bed at a time — a second admission would
  // leave the first one's bed occupied forever with nobody in it.
  const openAdmission = await IPDAdmission.findOne({ patient: data.patient, status: 'ADMITTED' }).select('admissionNo');
  if (openAdmission) {
    throw ApiError.conflict(
      `This patient is already admitted (${openAdmission.admissionNo}). Discharge that admission first.`,
      'PATIENT_ALREADY_ADMITTED',
      { admissionNo: openAdmission.admissionNo }
    );
  }

  // Take the bed first: if we created the admission first and the bed turned
  // out to be gone, we'd be left with an admission pointing at somebody
  // else's bed.
  const bed = await claimBed(data.bed);

  const admission = new IPDAdmission({
    ...data,
    ward: bed.ward,
    room: bed.room,
    createdBy: userId,
  });

  try {
    await admission.save();
    // Link the bed back to the admission. Both writes must land, otherwise
    // the bed is stranded as OCCUPIED with nobody in it and no discharge can
    // ever free it.
    await Bed.updateOne({ _id: bed._id }, { currentAdmission: admission._id });
  } catch (err) {
    // Undo everything this call did, in reverse order.
    await IPDAdmission.deleteOne({ _id: admission._id }).catch(() => {});
    await Bed.updateOne({ _id: bed._id }, { status: 'AVAILABLE', currentAdmission: null }).catch(() => {});
    throw err;
  }

  return admission.populate(POPULATE);
}

export async function updateAdmission(id, data) {
  const adm = await IPDAdmission.findById(id);
  if (!adm) throw ApiError.notFound('Admission not found', 'IPD_NOT_FOUND');
  if (adm.status !== 'ADMITTED') throw ApiError.badRequest('Admission is not active', 'IPD_NOT_ACTIVE');
  Object.assign(adm, data);
  await adm.save();
  return adm.populate(POPULATE);
}

export async function addNursingNote(id, note, userId) {
  const adm = await IPDAdmission.findById(id);
  if (!adm) throw ApiError.notFound('Admission not found', 'IPD_NOT_FOUND');
  if (adm.status !== 'ADMITTED') throw ApiError.badRequest('Admission is not active', 'IPD_NOT_ACTIVE');
  adm.nursingNotes.push({ note, by: userId, at: new Date() });
  await adm.save();
  return adm.populate(POPULATE);
}

export async function transferBed(id, newBedId) {
  const adm = await IPDAdmission.findById(id);
  if (!adm) throw ApiError.notFound('Admission not found', 'IPD_NOT_FOUND');
  if (adm.status !== 'ADMITTED') throw ApiError.badRequest('Admission is not active', 'IPD_NOT_ACTIVE');
  if (String(newBedId) === String(adm.bed)) throw ApiError.badRequest('Patient is already in this bed', 'SAME_BED');

  const oldBedId = adm.bed;

  // Claim the target bed *before* letting go of the current one — if the
  // target has just been taken, the patient stays exactly where they are
  // instead of ending up with no bed at all.
  const newBed = await claimBed(newBedId, adm._id);

  try {
    adm.bed = newBed._id;
    adm.ward = newBed.ward;
    adm.room = newBed.room;
    await adm.save();
  } catch (err) {
    await releaseBed(newBed._id, adm._id).catch(() => {});
    throw err;
  }

  // Only now is the old bed genuinely free.
  await releaseBed(oldBedId, adm._id);
  return adm.populate(POPULATE);
}

export async function dischargePatient(id, data) {
  const update = {
    status: 'DISCHARGED',
    dischargeDate: data.dischargeDate || new Date(),
  };
  if (data.dischargeSummary !== undefined) update.dischargeSummary = data.dischargeSummary;
  if (data.icdCode !== undefined) update.icdCode = data.icdCode;

  // Closing the admission is itself the guard: only a still-ADMITTED record
  // matches, so two concurrent discharges can't both run the bed-freeing
  // step below.
  const adm = await IPDAdmission.findOneAndUpdate(
    { _id: id, status: 'ADMITTED' },
    update,
    { new: true, runValidators: true }
  );
  if (!adm) {
    const exists = await IPDAdmission.exists({ _id: id });
    if (!exists) throw ApiError.notFound('Admission not found', 'IPD_NOT_FOUND');
    throw ApiError.badRequest('Patient is already discharged', 'ALREADY_DISCHARGED');
  }

  await releaseBed(adm.bed, adm._id);
  return adm.populate(POPULATE);
}

// Cancel a mistakenly-created admission — distinct from a discharge, since
// no care was actually given. Frees the bed just like a discharge does.
export async function cancelAdmission(id) {
  // Same atomic close-then-free shape as dischargePatient.
  const adm = await IPDAdmission.findOneAndUpdate(
    { _id: id, status: 'ADMITTED' },
    { status: 'CANCELLED' },
    { new: true }
  );
  if (!adm) {
    const exists = await IPDAdmission.exists({ _id: id });
    if (!exists) throw ApiError.notFound('Admission not found', 'IPD_NOT_FOUND');
    throw ApiError.badRequest('Only an active admission can be cancelled', 'IPD_NOT_ACTIVE');
  }

  await releaseBed(adm.bed, adm._id);
  return adm.populate(POPULATE);
}

// Flat rows for CSV/XLSX export.
export async function ipdRowsForExport({ search, status, patient }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (patient) filter.patient = patient;
  Object.assign(filter, await searchFilter(search));

  const items = await IPDAdmission.find(filter).populate(POPULATE).sort({ admissionDate: -1 });

  return items.map((a) => ({
    'Admission No': a.admissionNo,
    Patient: a.patient ? `${a.patient.firstName} ${a.patient.lastName || ''}`.trim() : '',
    'Patient UHID': a.patient?.uhid || '',
    Doctor: a.admittingDoctor ? `${a.admittingDoctor.firstName} ${a.admittingDoctor.lastName || ''}`.trim() : '',
    Ward: a.ward?.name || '',
    Room: a.room?.roomNo || '',
    Bed: a.bed?.bedNo || '',
    'Admitted On': a.admissionDate ? a.admissionDate.toISOString().slice(0, 10) : '',
    'Discharged On': a.dischargeDate ? a.dischargeDate.toISOString().slice(0, 10) : '',
    'Length of Stay (days)': a.lengthOfStayDays,
    Diagnosis: a.diagnosis,
    Status: a.status,
  }));
}

export async function ipdStats() {
  const [total, current] = await Promise.all([
    IPDAdmission.countDocuments({}),
    IPDAdmission.countDocuments({ status: 'ADMITTED' }),
  ]);
  return { total, current };
}
