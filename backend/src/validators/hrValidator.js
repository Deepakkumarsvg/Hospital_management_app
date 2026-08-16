import { z } from 'zod';
import { ATTENDANCE_STATUSES } from '../models/Attendance.js';
import { LEAVE_TYPES, LEAVE_STATUSES } from '../models/Leave.js';
import { PAYSLIP_STATUSES } from '../models/Payslip.js';

const objectId = (label) => z.string().regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

// --- Employees ---
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
  exitDate: z.coerce.date().optional().nullable(),
  exitReason: z.string().trim().max(300).optional(),
  leaveBalance: z.object({
    CASUAL: z.coerce.number().min(0).optional(),
    SICK: z.coerce.number().min(0).optional(),
    EARNED: z.coerce.number().min(0).optional(),
  }).optional(),
});
export const updateEmployeeSchema = createEmployeeSchema.partial();

export const listEmployeesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().default(''),
  department: objectId('department').optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).optional().default('ALL'),
});
export const exportEmployeesQuerySchema = z.object({
  search: z.string().trim().optional().default(''),
  department: objectId('department').optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).optional().default('ALL'),
  format: z.enum(['csv', 'xlsx']).optional().default('csv'),
});

// --- Attendance ---
export const markAttendanceSchema = z.object({
  employee: objectId('employee'),
  date: z.coerce.date(),
  status: z.enum(ATTENDANCE_STATUSES),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  note: z.string().trim().max(200).optional(),
});
export const markAttendanceBulkSchema = z.object({
  date: z.coerce.date(),
  status: z.enum(ATTENDANCE_STATUSES),
  employeeIds: z.array(objectId('employee')).optional(),
});
export const listAttendanceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  date: z.coerce.date().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  employee: objectId('employee').optional(),
  status: z.enum([...ATTENDANCE_STATUSES, 'ALL']).optional().default('ALL'),
});
export const exportAttendanceQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  employee: objectId('employee').optional(),
  status: z.enum([...ATTENDANCE_STATUSES, 'ALL']).optional().default('ALL'),
  format: z.enum(['csv', 'xlsx']).optional().default('csv'),
});
export const monthlyAttendanceQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

// --- Leaves ---
export const createLeaveSchema = z.object({
  employee: objectId('employee'),
  type: z.enum(LEAVE_TYPES).optional(),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
  halfDay: z.coerce.boolean().optional(),
  reason: z.string().trim().max(500).optional(),
}).refine((d) => !d.halfDay || d.fromDate.getTime() === d.toDate.getTime(), {
  message: 'A half-day leave must start and end on the same date', path: ['halfDay'],
});
export const leaveStatusSchema = z.object({ status: z.enum(['APPROVED', 'REJECTED']) });
export const listLeavesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum([...LEAVE_STATUSES, 'ALL']).optional().default('ALL'),
  employee: objectId('employee').optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export const exportLeavesQuerySchema = z.object({
  status: z.enum([...LEAVE_STATUSES, 'ALL']).optional().default('ALL'),
  employee: objectId('employee').optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  format: z.enum(['csv', 'xlsx']).optional().default('csv'),
});

// --- Payroll ---
export const generatePayrollSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});
export const listPayslipsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  employee: objectId('employee').optional(),
  status: z.enum([...PAYSLIP_STATUSES, 'ALL']).optional().default('ALL'),
});
export const exportPayslipsQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  employee: objectId('employee').optional(),
  status: z.enum([...PAYSLIP_STATUSES, 'ALL']).optional().default('ALL'),
  format: z.enum(['csv', 'xlsx']).optional().default('csv'),
});
export const adjustPayslipSchema = z.object({
  adjustment: z.coerce.number(),
  adjustmentNote: z.string().trim().max(300).optional(),
});
