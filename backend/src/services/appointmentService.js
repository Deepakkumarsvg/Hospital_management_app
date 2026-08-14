import { Appointment, STATUS_TRANSITIONS } from '../models/Appointment.js';
import { Patient } from '../models/Patient.js';
import { Doctor } from '../models/Doctor.js';
import { ApiError } from '../utils/ApiError.js';

const POPULATE = [
  { path: 'patient', select: 'uhid firstName lastName phone' },
  { path: 'doctor', select: 'firstName lastName specialization' },
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

  // Prevent a doctor from being double-booked at the same date+time.
  const start = new Date(data.date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const clash = await Appointment.findOne({
    doctor: data.doctor,
    time: data.time,
    date: { $gte: start, $lt: end },
    status: { $in: ['BOOKED', 'CHECKED_IN', 'IN_PROGRESS'] },
  });
  if (clash) throw ApiError.conflict('Doctor already has an appointment at this time', 'SLOT_TAKEN');

  const appt = new Appointment({ ...data, createdBy: userId });
  await appt.save();
  return appt.populate(POPULATE);
}

export async function updateAppointment(id, data) {
  const appt = await Appointment.findById(id);
  if (!appt) throw ApiError.notFound('Appointment not found', 'APPOINTMENT_NOT_FOUND');
  if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appt.status)) {
    throw ApiError.badRequest(`Cannot edit a ${appt.status.toLowerCase()} appointment`, 'APPOINTMENT_LOCKED');
  }
  Object.assign(appt, data);
  await appt.save();
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
  const appt = await Appointment.findByIdAndDelete(id);
  if (!appt) throw ApiError.notFound('Appointment not found', 'APPOINTMENT_NOT_FOUND');
  return appt;
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
