import { z } from 'zod';
import { ATTENDANCE_STATUSES } from '../models/Attendance.js';
import { LEAVE_TYPES, LEAVE_STATUSES } from '../models/Leave.js';

const objectId = (label) => z.string().regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

export const createEmployeeSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  designation: z.string().trim().max(80).optional(),
  department: objectId('department').optional().nullable(),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().email('Invalid email').or(z.literal('')).optional(),
  shift: z.enum(['MORNING', 'EVENING', 'NIGHT', 'GENERAL']).optional(),
  joiningDate: z.coerce.date().optional(),
  salary: z.coerce.number().min(0).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export const updateEmployeeSchema = createEmployeeSchema.partial();

export const markAttendanceSchema = z.object({
  employee: objectId('employee'),
  date: z.coerce.date(),
  status: z.enum(ATTENDANCE_STATUSES),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  note: z.string().trim().max(200).optional(),
});

export const createLeaveSchema = z.object({
  employee: objectId('employee'),
  type: z.enum(LEAVE_TYPES).optional(),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
  reason: z.string().trim().max(500).optional(),
});
export const leaveStatusSchema = z.object({ status: z.enum(['APPROVED', 'REJECTED']) });
