import { z } from 'zod';
import { BLOOD_GROUPS } from '../models/BloodDonor.js';
import { BLOOD_COMPONENTS } from '../models/BloodUnit.js';

const objectId = (label) => z.string().regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

export const createDonorSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  bloodGroup: z.enum(BLOOD_GROUPS),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().email('Invalid email').or(z.literal('')).optional(),
  age: z.coerce.number().min(18).max(65).optional().nullable(),
  address: z.string().trim().max(300).optional(),
});
export const updateDonorSchema = createDonorSchema.partial();

// Blood collection = registering a unit into stock.
export const collectUnitSchema = z.object({
  bloodGroup: z.enum(BLOOD_GROUPS),
  component: z.enum(BLOOD_COMPONENTS).optional(),
  donor: objectId('donor').optional().nullable(),
  collectionDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date(),
});

export const issueUnitSchema = z.object({
  patient: objectId('patient'),
  admission: objectId('admission').optional().nullable(),
  reason: z.enum(['Surgery', 'Transfusion', 'Emergency', 'Other']).optional(),
  chargeAmount: z.coerce.number().min(0).optional(),
  overrideCompatibility: z.coerce.boolean().optional(),
});

export const reserveUnitSchema = z.object({
  patient: objectId('patient'),
});

export const listUnitsQuerySchema = z.object({
  bloodGroup: z.enum([...BLOOD_GROUPS, 'ALL']).optional().default('ALL'),
  component: z.enum([...BLOOD_COMPONENTS, 'ALL']).optional().default('ALL'),
  status: z.enum(['AVAILABLE', 'RESERVED', 'ISSUED', 'EXPIRED', 'DISCARDED', 'ALL']).optional().default('ALL'),
});
