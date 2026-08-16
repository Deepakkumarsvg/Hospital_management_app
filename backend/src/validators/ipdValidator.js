import { z } from 'zod';

const objectId = (label) => z.string().regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

export const admitSchema = z.object({
  patient: objectId('patient'),
  admittingDoctor: objectId('doctor'),
  department: objectId('department'),
  bed: objectId('bed'),
  admissionDate: z.coerce.date().optional(),
  reason: z.string().trim().max(500).optional(),
  diagnosis: z.string().trim().max(2000).optional(),
  icdCode: z.string().trim().max(12).optional(),
});

export const updateAdmissionSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  diagnosis: z.string().trim().max(2000).optional(),
  icdCode: z.string().trim().max(12).optional(),
  admittingDoctor: objectId('doctor').optional(),
});

export const nursingNoteSchema = z.object({
  note: z.string().trim().min(1, 'Note is required').max(2000),
});

export const transferBedSchema = z.object({
  bed: objectId('bed'),
});

export const dischargeSchema = z.object({
  dischargeSummary: z.string().trim().max(4000).optional(),
  icdCode: z.string().trim().max(12).optional(),
  dischargeDate: z.coerce.date().optional(),
});

export const listIpdQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().default(''),
  status: z.enum(['ADMITTED', 'DISCHARGED', 'CANCELLED', 'ALL']).optional().default('ALL'),
  patient: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
});

export const exportIpdQuerySchema = z.object({
  search: z.string().trim().optional().default(''),
  status: z.enum(['ADMITTED', 'DISCHARGED', 'CANCELLED', 'ALL']).optional().default('ALL'),
  patient: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  format: z.enum(['csv', 'xlsx']).optional().default('csv'),
});
