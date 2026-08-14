import { z } from 'zod';
import { GENDERS, BLOOD_GROUPS } from '../models/Patient.js';

const phoneRegex = /^[0-9+\-\s()]{7,15}$/;

const addressSchema = z
  .object({
    line: z.string().trim().max(200).optional(),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().max(80).optional(),
    pincode: z.string().trim().max(12).optional(),
  })
  .optional();

const emergencyContactSchema = z
  .object({
    name: z.string().trim().max(100).optional(),
    relation: z.string().trim().max(60).optional(),
    phone: z.string().trim().regex(phoneRegex, 'Invalid phone').or(z.literal('')).optional(),
  })
  .optional();

const insuranceSchema = z
  .object({
    provider: z.string().trim().max(120).optional(),
    policyNumber: z.string().trim().max(80).optional(),
    validTill: z.coerce.date().optional().nullable(),
  })
  .optional();

// Shared shape; create requires the core fields, update makes them optional.
const baseShape = {
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().max(80).optional().default(''),
  gender: z.enum(GENDERS, { errorMap: () => ({ message: 'Gender is required' }) }),
  dateOfBirth: z.coerce.date({ errorMap: () => ({ message: 'Valid date of birth is required' }) }),
  phone: z.string().trim().regex(phoneRegex, 'Valid phone number is required'),
  email: z.string().trim().email('Invalid email').or(z.literal('')).optional(),
  bloodGroup: z.enum(BLOOD_GROUPS).optional(),
  address: addressSchema,
  emergencyContact: emergencyContactSchema,
  allergies: z.string().trim().max(1000).optional(),
  medicalHistory: z.string().trim().max(4000).optional(),
  insurance: insuranceSchema,
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
};

export const createPatientSchema = z.object(baseShape).refine(
  (d) => d.dateOfBirth <= new Date(),
  { message: 'Date of birth cannot be in the future', path: ['dateOfBirth'] }
);

// All fields optional on update.
export const updatePatientSchema = z
  .object(
    Object.fromEntries(Object.entries(baseShape).map(([k, v]) => [k, v.optional()]))
  )
  .refine((d) => !d.dateOfBirth || d.dateOfBirth <= new Date(), {
    message: 'Date of birth cannot be in the future',
    path: ['dateOfBirth'],
  });

export const listPatientsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().default(''),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).optional().default('ALL'),
  sort: z.enum(['newest', 'oldest', 'name']).optional().default('newest'),
});
