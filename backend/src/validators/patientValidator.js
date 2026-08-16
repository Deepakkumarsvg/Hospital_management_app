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

const insurancePolicySchema = z.object({
  provider: z.string().trim().max(120).optional(),
  policyNumber: z.string().trim().max(80).optional(),
  validTill: z.coerce.date().optional().nullable(),
});

// A patient may carry more than one policy (e.g. employer + personal cover).
const insurancesSchema = z.array(insurancePolicySchema).max(10).optional();

const MIN_DOB = () => new Date(Date.now() - 130 * 365.25 * 24 * 60 * 60 * 1000);

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
  insurances: insurancesSchema,
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
};

// Set when the caller has already been warned about a likely duplicate
// (same phone number) and wants to register the patient anyway.
const confirmDuplicateShape = { confirmDuplicate: z.boolean().optional().default(false) };

const dobInRange = (d) => d.dateOfBirth <= new Date() && d.dateOfBirth >= MIN_DOB();
const DOB_MESSAGE = { message: 'Enter a valid date of birth (must be in the past, within the last 130 years)', path: ['dateOfBirth'] };

export const createPatientSchema = z.object({ ...baseShape, ...confirmDuplicateShape }).refine(dobInRange, DOB_MESSAGE);

// All fields optional on update.
export const updatePatientSchema = z
  .object(
    Object.fromEntries(Object.entries(baseShape).map(([k, v]) => [k, v.optional()]))
  )
  .refine((d) => !d.dateOfBirth || dobInRange(d), DOB_MESSAGE);

export const listPatientsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().default(''),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).optional().default('ALL'),
  sort: z.enum(['newest', 'oldest', 'name']).optional().default('newest'),
});

export const exportPatientsQuerySchema = z.object({
  search: z.string().trim().optional().default(''),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).optional().default('ALL'),
  format: z.enum(['csv', 'xlsx']).optional().default('csv'),
});

export const mergePatientSchema = z.object({
  duplicateId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid duplicate patient id'),
});
