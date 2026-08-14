import { z } from 'zod';
import { GENDERS } from '../models/Patient.js';

const phoneRegex = /^[0-9+\-\s()]{7,15}$/;

export const registerSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().max(80).optional().default(''),
  gender: z.enum(GENDERS, { errorMap: () => ({ message: 'Gender is required' }) }),
  dateOfBirth: z.coerce.date({ errorMap: () => ({ message: 'Valid date of birth is required' }) }),
  phone: z.string().trim().regex(phoneRegex, 'Valid phone number is required'),
  email: z.string().trim().email('Valid email is required').toLowerCase(),
  password: z.string().min(6, 'Password must be at least 6 characters').max(72),
});

export const bookAppointmentSchema = z.object({
  doctor: z.string().trim().min(1, 'Doctor is required'),
  date: z.coerce.date({ errorMap: () => ({ message: 'Valid date is required' }) }),
  time: z.string().trim().regex(/^\d{2}:\d{2}$/, 'Time must be HH:mm'),
  type: z.enum(['NEW', 'FOLLOW_UP']).optional().default('NEW'),
  reason: z.string().trim().max(300).optional().default(''),
  teleconsult: z.coerce.boolean().optional().default(false),
});
