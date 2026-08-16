import { z } from 'zod';
import { OPD_STATUSES, MED_ROUTES } from '../models/OPDVisit.js';

const objectId = (label) => z.string().regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

const vitals = z.object({
  bp: z.string().trim().max(15).optional(),
  pulse: z.coerce.number().min(0).max(400).optional().nullable(),
  temperature: z.coerce.number().min(80).max(115).optional().nullable(),
  spo2: z.coerce.number().min(0).max(100).optional().nullable(),
  weight: z.coerce.number().min(0).max(500).optional().nullable(),
  height: z.coerce.number().min(0).max(300).optional().nullable(),
  respiratoryRate: z.coerce.number().min(0).max(120).optional().nullable(),
}).optional();

const prescriptionItem = z.object({
  medicine: z.string().trim().min(1, 'Medicine name is required').max(120),
  dosage: z.string().trim().max(40).optional(),
  frequency: z.string().trim().max(40).optional(),
  duration: z.string().trim().max(40).optional(),
  route: z.enum(MED_ROUTES).optional(),
  instructions: z.string().trim().max(200).optional(),
  quantity: z.coerce.number().min(0).optional(),
});

export const createOpdVisitSchema = z.object({
  patient: objectId('patient'),
  doctor: objectId('doctor'),
  department: objectId('department'),
  appointment: objectId('appointment').optional().nullable(),
  visitDate: z.coerce.date().optional(),
  vitals,
  symptoms: z.string().trim().max(2000).optional(),
  diagnosis: z.string().trim().max(2000).optional(),
  icdCode: z.string().trim().max(12).optional(),
  clinicalNotes: z.string().trim().max(4000).optional(),
  prescription: z.array(prescriptionItem).optional(),
  followUpDate: z.coerce.date().optional().nullable(),
});

// Everything editable while the visit is OPEN.
export const updateOpdVisitSchema = z.object({
  vitals,
  symptoms: z.string().trim().max(2000).optional(),
  diagnosis: z.string().trim().max(2000).optional(),
  icdCode: z.string().trim().max(12).optional(),
  clinicalNotes: z.string().trim().max(4000).optional(),
  prescription: z.array(prescriptionItem).optional(),
  followUpDate: z.coerce.date().optional().nullable(),
  status: z.enum(OPD_STATUSES).optional(),
});

export const listOpdQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().default(''),
  status: z.enum([...OPD_STATUSES, 'ALL']).optional().default('ALL'),
  doctor: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  patient: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  date: z.coerce.date().optional(),
});

export const exportOpdQuerySchema = z.object({
  search: z.string().trim().optional().default(''),
  status: z.enum([...OPD_STATUSES, 'ALL']).optional().default('ALL'),
  doctor: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  patient: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  date: z.coerce.date().optional(),
  format: z.enum(['csv', 'xlsx']).optional().default('csv'),
});
