import { Appointment, STATUS_TRANSITIONS } from '../models/Appointment.js';
import { Patient } from '../models/Patient.js';
import { Doctor } from '../models/Doctor.js';
import { OPDVisit } from '../models/OPDVisit.js';
import { ApiError } from '../utils/ApiError.js';

// Shared clash guard — used on both create and reschedule (update), for both
// the doctor's slot and the patient's slot, since either side can double
// book. `excludeId` skips the appointment being edited so it doesn't clash
// with itself.
async function assertSlotFree({ doctor, patient, date, time, excludeId }) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const base = { time, date: { $gte: start, $lt: end }, status: { $in: ['BOOKED', 'CHECKED_IN', 'IN_PROGRESS'] } };
  if (excludeId) base._id = { $ne: excludeId };

  const [doctorClash, patientClash] = await Promise.all([
    Appointment.findOne({ ...base, doctor }),
    Appointment.findOne({ ...base, patient }),
  ]);
  if (doctorClash) throw ApiError.conflict('Doctor already has an appointment at this time', 'SLOT_TAKEN');
  if (patientClash) throw ApiError.conflict('This patient already has another appointment at this time', 'PATIENT_SLOT_TAKEN');
}

// The check above can't close the gap between its read and the write — two
// simultaneous bookings both pass it. The unique slot indexes on the model do
// close it; this turns the resulting duplicate-key error back into the same
// conflict the caller would have got from assertSlotFree.
function rethrowSlotClash(err) {
  if (err?.code !== 11000) throw err;
  if (err.keyPattern?.doctor) {
    throw ApiError.conflict('Doctor already has an appointment at this time', 'SLOT_TAKEN');
  }
  if (err.keyPattern?.patient) {
    throw ApiError.conflict('This patient already has another appointment at this time', 'PATIENT_SLOT_TAKEN');
  }
  throw err;
}

const POPULATE = [
  { path: 'patient', select: 'uhid firstName lastName phone' },
  { path: 'doctor', select: 'firstName lastName specialization user' },
  { path: 'department', select: 'name code' },
];

export async function listAppointments({ page, limit, search, status, doctor, patient, date }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (doctor) filter.doctor = doctor;
  if (patient) filter.patient = patient;
  if (date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    filter.date = { $gte: start, $lt: end };
  }
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.appointmentNo = rx;
  }

  const [items, total] = await Promise.all([
    Appointment.find(filter).populate(POPULATE).sort({ date: -1, time: -1 }).skip((page - 1) * limit).limit(limit),
    Appointment.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function getAppointment(id) {
  const appt = await Appointment.findById(id).populate(POPULATE);
  if (!appt) throw ApiError.notFound('Appointment not found', 'APPOINTMENT_NOT_FOUND');
  return appt;
}

export async function createAppointment(data, userId) {
  // Validate referenced entities exist and are usable.
  const [patient, doctor] = await Promise.all([
    Patient.findById(data.patient).select('_id'),
    Doctor.findById(data.doctor).select('_id department status'),
  ]);
  if (!patient) throw ApiError.badRequest('Patient does not exist', 'PATIENT_NOT_FOUND');
  if (!doctor) throw ApiError.badRequest('Doctor does not exist', 'DOCTOR_NOT_FOUND');
  if (doctor.status !== 'ACTIVE') throw ApiError.badRequest('Doctor is not active', 'DOCTOR_INACTIVE');

  await assertSlotFree({ doctor: data.doctor, patient: data.patient, date: data.date, time: data.time });

  const appt = new Appointment({ ...data, createdBy: userId });
  await appt.save().catch(rethrowSlotClash);
  return appt.populate(POPULATE);
}

export async function updateAppointment(id, data) {
  const appt = await Appointment.findById(id);
  if (!appt) throw ApiError.notFound('Appointment not found', 'APPOINTMENT_NOT_FOUND');
  if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appt.status)) {
    throw ApiError.badRequest(`Cannot edit a ${appt.status.toLowerCase()} appointment`, 'APPOINTMENT_LOCKED');
  }

  // Re-run the double-booking guard on reschedule — the doctor can't be
  // changed via update, but the slot can, and it must stay clash-free.
  if (data.date || data.time) {
    await assertSlotFree({
      doctor: appt.doctor,
      patient: appt.patient,
      date: data.date || appt.date,
      time: data.time || appt.time,
      excludeId: id,
    });
  }

  Object.assign(appt, data);
  await appt.save().catch(rethrowSlotClash);
  return appt.populate(POPULATE);
}

export async function changeStatus(id, nextStatus) {
  const appt = await Appointment.findById(id);
  if (!appt) throw ApiError.notFound('Appointment not found', 'APPOINTMENT_NOT_FOUND');

  const allowed = STATUS_TRANSITIONS[appt.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw ApiError.badRequest(
      `Cannot change status from ${appt.status} to ${nextStatus}`,
      'INVALID_STATUS_TRANSITION'
    );
  }
  appt.status = nextStatus;
  await appt.save();
  return appt.populate(POPULATE);
}

export async function deleteAppointment(id) {
  const appt = await Appointment.findById(id);
  if (!appt) throw ApiError.notFound('Appointment not found', 'APPOINTMENT_NOT_FOUND');

  // Refuse to delete an appointment that already has an OPD visit tied to
  // it — that would orphan the visit's back-reference and lose the link to
  // its originating booking.
  const opdVisits = await OPDVisit.countDocuments({ appointment: id });
  if (opdVisits) {
    throw ApiError.conflict(
      'This appointment has an OPD visit on record and cannot be deleted. Cancel it instead.',
      'APPOINTMENT_HAS_HISTORY',
      { opdVisits }
    );
  }

  await Appointment.findByIdAndDelete(id);
  return appt;
}

// Flat rows for CSV/XLSX export.
export async function appointmentRowsForExport({ search, status, doctor, patient, date }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (doctor) filter.doctor = doctor;
  if (patient) filter.patient = patient;
  if (date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    filter.date = { $gte: start, $lt: end };
  }
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.appointmentNo = rx;
  }

  const items = await Appointment.find(filter).populate(POPULATE).sort({ date: -1, time: -1 });

  return items.map((a) => ({
    'Appt No': a.appointmentNo,
    Patient: a.patient ? `${a.patient.firstName} ${a.patient.lastName || ''}`.trim() : '',
    'Patient UHID': a.patient?.uhid || '',
    Doctor: a.doctor ? `${a.doctor.firstName} ${a.doctor.lastName || ''}`.trim() : '',
    Department: a.department?.name || '',
    Date: a.date ? a.date.toISOString().slice(0, 10) : '',
    Time: a.time,
    Type: a.type,
    Status: a.status,
    Reason: a.reason,
  }));
}

export async function appointmentStats() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const [total, today] = await Promise.all([
    Appointment.countDocuments({}),
    Appointment.countDocuments({ date: { $gte: start, $lt: end } }),
  ]);
  return { total, today };
}
