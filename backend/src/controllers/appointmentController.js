import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/appointmentService.js';
import { notify } from '../services/notificationService.js';
import { ROLES } from '../config/roles.js';

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listAppointments(req.query);
  sendSuccess(res, { message: 'Appointments fetched', data: items, meta: pagination });
});

export const stats = asyncHandler(async (_req, res) => {
  sendSuccess(res, { message: 'Appointment stats', data: await service.appointmentStats() });
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
  sendSuccess(res, { message: 'Appointment updated', data: await service.updateAppointment(req.params.id, req.body) });
});

export const changeStatus = asyncHandler(async (req, res) => {
  const appt = await service.changeStatus(req.params.id, req.body.status);
  sendSuccess(res, { message: `Appointment marked ${req.body.status}`, data: appt });
});

export const remove = asyncHandler(async (req, res) => {
  await service.deleteAppointment(req.params.id);
  sendSuccess(res, { message: 'Appointment deleted', data: null });
});
