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

export async function admitPatient(data, userId) {
  const [patient, doctor, bed] = await Promise.all([
    Patient.findById(data.patient).select('_id'),
    Doctor.findById(data.admittingDoctor).select('_id'),
    Bed.findById(data.bed),
  ]);
  if (!patient) throw ApiError.badRequest('Patient does not exist', 'PATIENT_NOT_FOUND');
  if (!doctor) throw ApiError.badRequest('Doctor does not exist', 'DOCTOR_NOT_FOUND');
  if (!bed) throw ApiError.badRequest('Bed does not exist', 'BED_NOT_FOUND');
  if (bed.status !== 'AVAILABLE') throw ApiError.conflict('Bed is not available', 'BED_UNAVAILABLE');

  const admission = new IPDAdmission({
    ...data,
    ward: bed.ward,
    room: bed.room,
    createdBy: userId,
  });
  await admission.save();

  // Occupy the bed and link it to this admission.
  bed.status = 'OCCUPIED';
  bed.currentAdmission = admission._id;
  await bed.save();

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

  const newBed = await Bed.findById(newBedId);
  if (!newBed) throw ApiError.badRequest('Bed does not exist', 'BED_NOT_FOUND');
  if (String(newBed._id) === String(adm.bed)) throw ApiError.badRequest('Patient is already in this bed', 'SAME_BED');
  if (newBed.status !== 'AVAILABLE') throw ApiError.conflict('Target bed is not available', 'BED_UNAVAILABLE');

  // Free the old bed.
  await Bed.findByIdAndUpdate(adm.bed, { status: 'AVAILABLE', currentAdmission: null });
  // Occupy the new bed.
  newBed.status = 'OCCUPIED';
  newBed.currentAdmission = adm._id;
  await newBed.save();

  adm.bed = newBed._id;
  adm.ward = newBed.ward;
  adm.room = newBed.room;
  await adm.save();
  return adm.populate(POPULATE);
}

export async function dischargePatient(id, data) {
  const adm = await IPDAdmission.findById(id);
  if (!adm) throw ApiError.notFound('Admission not found', 'IPD_NOT_FOUND');
  if (adm.status !== 'ADMITTED') throw ApiError.badRequest('Patient is already discharged', 'ALREADY_DISCHARGED');

  adm.status = 'DISCHARGED';
  adm.dischargeDate = data.dischargeDate || new Date();
  if (data.dischargeSummary !== undefined) adm.dischargeSummary = data.dischargeSummary;
  if (data.icdCode !== undefined) adm.icdCode = data.icdCode;
  await adm.save();

  // Free the bed.
  await Bed.findByIdAndUpdate(adm.bed, { status: 'AVAILABLE', currentAdmission: null });
  return adm.populate(POPULATE);
}

// Cancel a mistakenly-created admission — distinct from a discharge, since
// no care was actually given. Frees the bed just like a discharge does.
export async function cancelAdmission(id) {
  const adm = await IPDAdmission.findById(id);
  if (!adm) throw ApiError.notFound('Admission not found', 'IPD_NOT_FOUND');
  if (adm.status !== 'ADMITTED') {
    throw ApiError.badRequest('Only an active admission can be cancelled', 'IPD_NOT_ACTIVE');
  }

  adm.status = 'CANCELLED';
  await adm.save();

  await Bed.findByIdAndUpdate(adm.bed, { status: 'AVAILABLE', currentAdmission: null });
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
