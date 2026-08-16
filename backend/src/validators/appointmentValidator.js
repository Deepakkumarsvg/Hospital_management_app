import { z } from 'zod';
import { APPOINTMENT_TYPES, APPOINTMENT_STATUSES } from '../models/Appointment.js';

const objectId = (label) => z.string().regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm');

export const createAppointmentSchema = z.object({
  patient: objectId('patient'),
  doctor: objectId('doctor'),
  department: objectId('department'),
  date: z.coerce.date({ errorMap: () => ({ message: 'Valid date is required' }) }),
  time,
  type: z.enum(APPOINTMENT_TYPES).optional(),
  reason: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const updateAppointmentSchema = z.object({
  date: z.coerce.date().optional(),
  time: time.optional(),
  type: z.enum(APPOINTMENT_TYPES).optional(),
  reason: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const changeStatusSchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES),
});

export const listAppointmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().default(''),
  status: z.enum([...APPOINTMENT_STATUSES, 'ALL']).optional().default('ALL'),
  doctor: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  patient: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  date: z.coerce.date().optional(), // filter to a single day
});

export const exportAppointmentsQuerySchema = z.object({
  search: z.string().trim().optional().default(''),
  status: z.enum([...APPOINTMENT_STATUSES, 'ALL']).optional().default('ALL'),
  doctor: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  patient: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  date: z.coerce.date().optional(),
  format: z.enum(['csv', 'xlsx']).optional().default('csv'),
});
