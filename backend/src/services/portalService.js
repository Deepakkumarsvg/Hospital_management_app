import mongoose from 'mongoose';
import { Patient } from '../models/Patient.js';
import { User } from '../models/User.js';
import { Doctor } from '../models/Doctor.js';
import { Appointment } from '../models/Appointment.js';
import { OPDVisit } from '../models/OPDVisit.js';
import { LabOrder } from '../models/LabOrder.js';
import { RadiologyOrder } from '../models/RadiologyOrder.js';
import { Invoice } from '../models/Invoice.js';
import { ApiError } from '../utils/ApiError.js';
import { signToken } from '../utils/jwt.js';
import { ROLES } from '../config/roles.js';
import { createAppointment, changeStatus, updateAppointment } from './appointmentService.js';
import * as gateway from './paymentGatewayService.js';

// Self-registration: creates a Patient profile + a linked PATIENT login.
export async function register(data) {
  const email = data.email.toLowerCase();
  if (await User.findOne({ email })) {
    throw ApiError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
  }

  const patient = new Patient({
    firstName: data.firstName,
    lastName: data.lastName,
    gender: data.gender,
    dateOfBirth: data.dateOfBirth,
    phone: data.phone,
    email,
  });
  await patient.save(); // generates UHID

  const user = new User({
    name: [data.firstName, data.lastName].filter(Boolean).join(' '),
    email,
    phone: data.phone,
    role: ROLES.PATIENT,
    patient: patient._id,
    status: 'ACTIVE',
  });
  await user.setPassword(data.password);
  await user.save();

  const token = signToken({ sub: user._id.toString(), role: user.role });
  return { token, user: user.toSafeJSON(), patient };
}

export async function getProfile(patientId) {
  const patient = await Patient.findById(patientId);
  if (!patient) throw ApiError.notFound('Patient profile not found', 'PATIENT_NOT_FOUND');
  return patient;
}

// Active doctors for the booking form.
export async function listDoctors() {
  return Doctor.find({ status: 'ACTIVE' })
    .populate('department', 'name code')
    .select('firstName lastName specialization department consultationFee availability')
    .sort({ firstName: 1 });
}

const APPT_POPULATE = [
  { path: 'doctor', select: 'firstName lastName specialization' },
  { path: 'department', select: 'name code' },
];

export async function listAppointments(patientId) {
  return Appointment.find({ patient: patientId }).populate(APPT_POPULATE).sort({ date: -1, time: -1 });
}

export async function book(patientId, data, userId) {
  const doctor = await Doctor.findById(data.doctor).select('department status');
  if (!doctor) throw ApiError.badRequest('Doctor does not exist', 'DOCTOR_NOT_FOUND');
  // Department is derived from the chosen doctor.
  return createAppointment(
    { ...data, patient: patientId, department: doctor.department },
    userId
  );
}

export async function cancel(patientId, appointmentId) {
  const appt = await Appointment.findById(appointmentId).select('patient status');
  if (!appt) throw ApiError.notFound('Appointment not found', 'APPOINTMENT_NOT_FOUND');
  // Ownership guard — a patient may only touch their own appointments.
  if (String(appt.patient) !== String(patientId)) {
    throw ApiError.forbidden('Not your appointment', 'FORBIDDEN');
  }
  return changeStatus(appointmentId, 'CANCELLED');
}

export async function reschedule(patientId, appointmentId, { date, time }) {
  const appt = await Appointment.findById(appointmentId).select('patient status');
  if (!appt) throw ApiError.notFound('Appointment not found', 'APPOINTMENT_NOT_FOUND');
  if (String(appt.patient) !== String(patientId)) throw ApiError.forbidden('Not your appointment', 'FORBIDDEN');
  return updateAppointment(appointmentId, { date, time });
}

export async function listPrescriptions(patientId) {
  return OPDVisit.find({ patient: patientId })
    .populate([{ path: 'doctor', select: 'firstName lastName specialization' }, { path: 'department', select: 'name' }])
    .sort({ visitDate: -1 });
}

export async function listLabOrders(patientId) {
  return LabOrder.find({ patient: patientId })
    .populate({ path: 'doctor', select: 'firstName lastName' })
    .sort({ createdAt: -1 });
}

export async function listRadOrders(patientId) {
  return RadiologyOrder.find({ patient: patientId })
    .populate({ path: 'doctor', select: 'firstName lastName' })
    .sort({ createdAt: -1 });
}

export async function listInvoices(patientId) {
  return Invoice.find({ patient: patientId }).sort({ createdAt: -1 });
}

// Ownership-checked fetch used by the portal PDF endpoints.
export async function ownedInvoice(patientId, invoiceId) {
  const invoice = await Invoice.findById(invoiceId).populate({ path: 'patient', select: 'uhid firstName lastName phone' });
  if (!invoice) throw ApiError.notFound('Invoice not found', 'INVOICE_NOT_FOUND');
  if (String(invoice.patient?._id || invoice.patient) !== String(patientId)) {
    throw ApiError.forbidden('Not your invoice', 'FORBIDDEN');
  }
  return invoice;
}

export async function ownedVisit(patientId, visitId) {
  const visit = await OPDVisit.findById(visitId).populate([
    { path: 'patient', select: 'uhid firstName lastName phone gender dateOfBirth allergies' },
    { path: 'doctor', select: 'firstName lastName specialization' },
    { path: 'department', select: 'name code' },
  ]);
  if (!visit) throw ApiError.notFound('Visit not found', 'OPD_NOT_FOUND');
  if (String(visit.patient?._id || visit.patient) !== String(patientId)) {
    throw ApiError.forbidden('Not your visit', 'FORBIDDEN');
  }
  return visit;
}

// ---- Online payment (ownership-checked) ----
export async function createPaymentOrder(patientId, invoiceId) {
  await ownedInvoice(patientId, invoiceId); // throws if not owned
  return gateway.createOrder(invoiceId);
}

export async function verifyPayment(patientId, invoiceId, body) {
  await ownedInvoice(patientId, invoiceId);
  return gateway.verifyAndCapture(invoiceId, body);
}

// Dashboard counters.
export async function summary(patientId) {
  const [appointments, upcoming, prescriptions, labOrders, invoices, dueAgg] = await Promise.all([
    Appointment.countDocuments({ patient: patientId }),
    Appointment.countDocuments({ patient: patientId, status: { $in: ['BOOKED', 'CHECKED_IN'] }, date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
    OPDVisit.countDocuments({ patient: patientId }),
    LabOrder.countDocuments({ patient: patientId }),
    Invoice.countDocuments({ patient: patientId }),
    Invoice.aggregate([
      { $match: { patient: new mongoose.Types.ObjectId(String(patientId)), status: { $ne: 'CANCELLED' } } },
      { $group: { _id: null, due: { $sum: '$dueAmount' } } },
    ]),
  ]);
  return {
    appointments, upcoming, prescriptions, labOrders, invoices,
    totalDue: Math.round(dueAgg[0]?.due || 0),
  };
}
