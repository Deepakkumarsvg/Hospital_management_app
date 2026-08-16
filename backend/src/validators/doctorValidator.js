import { z } from 'zod';
import { WEEKDAYS } from '../models/Doctor.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid department');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm');
const phoneRegex = /^[0-9+\-\s()]{7,15}$/;

const availabilityItem = z.object({
  day: z.enum(WEEKDAYS),
  from: time.optional(),
  to: time.optional(),
});

const base = {
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().max(80).optional().default(''),
  registrationNo: z.string().trim().min(2, 'Registration number is required').max(40),
  specialization: z.string().trim().min(2, 'Specialization is required').max(80),
  department: objectId,
  qualification: z.string().trim().max(120).optional(),
  experienceYears: z.coerce.number().min(0).max(70).optional(),
  phone: z.string().trim().regex(phoneRegex, 'Valid phone is required'),
  email: z.string().trim().email('Invalid email').or(z.literal('')).optional(),
  consultationFee: z.coerce.number().min(0).optional(),
  availability: z.array(availabilityItem).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  // Optional link to a login account (a user with the DOCTOR role).
  user: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user').optional().nullable(),
};

export const createDoctorSchema = z.object(base);
export const updateDoctorSchema = z.object(
  Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v.optional()]))
);

export const listDoctorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().default(''),
  department: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).optional().default('ALL'),
});

export const exportDoctorsQuerySchema = z.object({
  search: z.string().trim().optional().default(''),
  department: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).optional().default('ALL'),
  format: z.enum(['csv', 'xlsx']).optional().default('csv'),
});
