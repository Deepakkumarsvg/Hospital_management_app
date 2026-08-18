import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/portalService.js';
import { getSettings } from '../services/settingService.js';
import { generateInvoicePdf, generatePrescriptionPdf } from '../utils/pdf.js';
import { notify } from '../services/notificationService.js';
import { audit } from '../utils/audit.js';
// Documents carry paise; audit lines and notifications are read by humans.
import { toRupees } from '../utils/money.js';
import { ROLES } from '../config/roles.js';

// ---- Public ----
export const register = asyncHandler(async (req, res) => {
  // The tenant is baked into the issued token, exactly as it is on staff
  // login — otherwise a patient's token would be the only kind that isn't
  // bound to the hospital that issued it.
  const result = await service.register(req.body, req.tenant);
  sendSuccess(res, { statusCode: 201, message: 'Registration successful', data: result });
});

// ---- Authenticated patient (req.patientId set by requirePatient) ----
export const me = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Profile', data: await service.getProfile(req.patientId) }));

export const summary = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Portal summary', data: await service.summary(req.patientId) }));

export const doctors = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Doctors', data: await service.listDoctors() }));

export const appointments = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Appointments', data: await service.listAppointments(req.patientId) }));

export const book = asyncHandler(async (req, res) => {
  const appt = await service.book(req.patientId, req.body, req.user._id);
  audit(req, { action: 'CREATE', module: 'Appointment', recordId: appt.appointmentNo, description: `Portal booking ${appt.appointmentNo}` });
  notify({ role: ROLES.ADMIN, type: 'APPOINTMENT', title: 'New online booking', message: `${appt.appointmentNo}`, link: '/appointments' });
  sendSuccess(res, { statusCode: 201, message: 'Appointment booked', data: appt });
});

// Ping the assigned doctor's login (if linked) about a patient-initiated change.
function notifyDoctor(appt, title, message) {
  if (!appt.doctor?.user) return;
  notify({ user: appt.doctor.user, type: 'APPOINTMENT', title, message, link: '/appointments' });
}

export const cancel = asyncHandler(async (req, res) => {
  const appt = await service.cancel(req.patientId, req.params.id);
  notifyDoctor(appt, 'Appointment cancelled', `${appt.appointmentNo} was cancelled by the patient`);
  sendSuccess(res, { message: 'Appointment cancelled', data: appt });
});

export const reschedule = asyncHandler(async (req, res) => {
  const appt = await service.reschedule(req.patientId, req.params.id, req.body);
  notifyDoctor(appt, 'Appointment rescheduled',
    `${appt.appointmentNo} moved to ${new Date(appt.date).toLocaleDateString()} ${appt.time} by the patient`);
  sendSuccess(res, { message: 'Appointment rescheduled', data: appt });
});

export const prescriptions = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Prescriptions', data: await service.listPrescriptions(req.patientId) }));

export const labOrders = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Lab orders', data: await service.listLabOrders(req.patientId) }));

export const radOrders = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Radiology orders', data: await service.listRadOrders(req.patientId) }));

export const invoices = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Invoices', data: await service.listInvoices(req.patientId) }));

export const invoicePdf = asyncHandler(async (req, res) => {
  const [invoice, settings] = await Promise.all([
    service.ownedInvoice(req.patientId, req.params.id),
    getSettings(),
  ]);
  await generateInvoicePdf(res, { invoice, payments: [], settings });
});

export const prescriptionPdf = asyncHandler(async (req, res) => {
  const [visit, settings] = await Promise.all([
    service.ownedVisit(req.patientId, req.params.id),
    getSettings(),
  ]);
  await generatePrescriptionPdf(res, { visit, settings });
});

// ---- Online payment ----
export const payOrder = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Payment order', data: await service.createPaymentOrder(req.patientId, req.params.id) }));

export const payVerify = asyncHandler(async (req, res) => {
  const result = await service.verifyPayment(req.patientId, req.params.id, req.body);
  if (result.payment) {
    audit(req, { action: 'PAYMENT', module: 'Payment', recordId: result.payment.receiptNo, description: `Online ₹${toRupees(result.payment.amount)} on ${result.invoice.invoiceNo}` });
    notify({ role: ROLES.ACCOUNTANT, type: 'BILLING', title: 'Online payment received', message: `${result.invoice.invoiceNo} · ₹${toRupees(result.payment.amount)}`, link: '/billing' });
  }
  sendSuccess(res, { message: 'Payment successful', data: result });
});
