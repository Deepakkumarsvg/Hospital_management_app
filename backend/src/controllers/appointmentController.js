import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/appointmentService.js';
import { notify } from '../services/notificationService.js';
import { ROLES } from '../config/roles.js';
import { sendCsv, sendExcel } from '../utils/exporters.js';

// Ping the assigned doctor's login (if linked) about a change to their schedule.
function notifyDoctor(appt, title, message) {
  if (!appt.doctor?.user) return;
  notify({ user: appt.doctor.user, type: 'APPOINTMENT', title, message, link: '/appointments' });
}

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listAppointments(req.query);
  sendSuccess(res, { message: 'Appointments fetched', data: items, meta: pagination });
});

export const stats = asyncHandler(async (_req, res) => {
  sendSuccess(res, { message: 'Appointment stats', data: await service.appointmentStats() });
});

// GET /api/appointments/export?format=csv|xlsx&search=&status=&doctor=&patient=&date=
export const exportAppointments = asyncHandler(async (req, res) => {
  const rows = await service.appointmentRowsForExport(req.query);
  const name = `appointments-${new Date().toISOString().slice(0, 10)}`;
  if (req.query.format === 'xlsx') return sendExcel(res, name, rows, 'Appointments');
  return sendCsv(res, name, rows);
});

export const get = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Appointment fetched', data: await service.getAppointment(req.params.id) });
});

export const create = asyncHandler(async (req, res) => {
  const appt = await service.createAppointment(req.body, req.user?._id);
  notify({
    role: ROLES.ADMIN, type: 'APPOINTMENT', title: 'New appointment booked',
    message: `${appt.appointmentNo} · ${appt.patient?.firstName || 'Patient'} with Dr. ${appt.doctor?.firstName || ''} on ${new Date(appt.date).toLocaleDateString()} ${appt.time}`,
    link: '/appointments',
  });
  sendSuccess(res, { statusCode: 201, message: 'Appointment booked successfully', data: appt });
});

export const update = asyncHandler(async (req, res) => {
  const appt = await service.updateAppointment(req.params.id, req.body);
  if (req.body.date || req.body.time) {
    notifyDoctor(appt, 'Appointment rescheduled',
      `${appt.appointmentNo} moved to ${new Date(appt.date).toLocaleDateString()} ${appt.time}`);
  }
  sendSuccess(res, { message: 'Appointment updated', data: appt });
});

export const changeStatus = asyncHandler(async (req, res) => {
  const appt = await service.changeStatus(req.params.id, req.body.status);
  if (req.body.status === 'CANCELLED') {
    notifyDoctor(appt, 'Appointment cancelled', `${appt.appointmentNo} was cancelled`);
  }
  sendSuccess(res, { message: `Appointment marked ${req.body.status}`, data: appt });
});

export const remove = asyncHandler(async (req, res) => {
  await service.deleteAppointment(req.params.id);
  sendSuccess(res, { message: 'Appointment deleted', data: null });
});
