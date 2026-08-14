import { OPDVisit } from '../models/OPDVisit.js';
import { Patient } from '../models/Patient.js';
import { Doctor } from '../models/Doctor.js';
import { Appointment } from '../models/Appointment.js';
import { ApiError } from '../utils/ApiError.js';

const POPULATE = [
  { path: 'patient', select: 'uhid firstName lastName phone gender dateOfBirth allergies' },
  { path: 'doctor', select: 'firstName lastName specialization' },
  { path: 'department', select: 'name code' },
];

export async function listVisits({ page, limit, search, status, doctor, patient, date }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (doctor) filter.doctor = doctor;
  if (patient) filter.patient = patient;
  if (date) {
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    filter.visitDate = { $gte: start, $lt: end };
  }
  if (search) filter.visitNo = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  const [items, total] = await Promise.all([
    OPDVisit.find(filter).populate(POPULATE).sort({ visitDate: -1 }).skip((page - 1) * limit).limit(limit),
    OPDVisit.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

// Flag prescribed medicines that clash with the patient's recorded allergies.
export async function checkAllergies(patientId, medicines = []) {
  const patient = await Patient.findById(patientId).select('allergies');
  const allergies = (patient?.allergies || '')
    .split(/[,;\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const warnings = [];
  for (const med of medicines) {
    const name = String(med || '').toLowerCase();
    for (const alg of allergies) {
      if (alg && name.includes(alg)) warnings.push({ medicine: med, allergy: alg });
    }
  }
  return { allergies, warnings };
}

export async function getVisit(id) {
  const visit = await OPDVisit.findById(id).populate(POPULATE);
  if (!visit) throw ApiError.notFound('OPD visit not found', 'OPD_NOT_FOUND');
  return visit;
}

export async function createVisit(data, userId) {
  const [patient, doctor] = await Promise.all([
    Patient.findById(data.patient).select('_id'),
    Doctor.findById(data.doctor).select('_id status'),
  ]);
  if (!patient) throw ApiError.badRequest('Patient does not exist', 'PATIENT_NOT_FOUND');
  if (!doctor) throw ApiError.badRequest('Doctor does not exist', 'DOCTOR_NOT_FOUND');

  const visit = new OPDVisit({ ...data, createdBy: userId });
  await visit.save();

  // If started from an appointment, advance it to IN_PROGRESS.
  if (data.appointment) {
    await Appointment.findOneAndUpdate(
      { _id: data.appointment, status: { $in: ['BOOKED', 'CHECKED_IN'] } },
      { status: 'IN_PROGRESS' }
    ).catch(() => {});
  }
  return visit.populate(POPULATE);
}

export async function updateVisit(id, data) {
  const visit = await OPDVisit.findById(id);
  if (!visit) throw ApiError.notFound('OPD visit not found', 'OPD_NOT_FOUND');
  if (visit.status !== 'OPEN' && data.status !== undefined) {
    // allow re-opening only from COMPLETED? Keep simple: block edits once not OPEN.
  }
  if (visit.status === 'COMPLETED') {
    throw ApiError.badRequest('Cannot edit a completed visit', 'OPD_LOCKED');
  }

  const wasOpen = visit.status === 'OPEN';
  Object.assign(visit, data);
  await visit.save();

  // Completing the visit also completes its appointment.
  if (wasOpen && data.status === 'COMPLETED' && visit.appointment) {
    await Appointment.findOneAndUpdate(
      { _id: visit.appointment, status: { $in: ['CHECKED_IN', 'IN_PROGRESS'] } },
      { status: 'COMPLETED' }
    ).catch(() => {});
  }
  return visit.populate(POPULATE);
}

export async function deleteVisit(id) {
  const visit = await OPDVisit.findByIdAndDelete(id);
  if (!visit) throw ApiError.notFound('OPD visit not found', 'OPD_NOT_FOUND');
  return visit;
}

export async function opdStats() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const [total, today, open] = await Promise.all([
    OPDVisit.countDocuments({}),
    OPDVisit.countDocuments({ visitDate: { $gte: start, $lt: end } }),
    OPDVisit.countDocuments({ status: 'OPEN' }),
  ]);
  return { total, today, open };
}
