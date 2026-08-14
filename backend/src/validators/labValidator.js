import { z } from 'zod';
import { SAMPLE_TYPES } from '../models/LabTest.js';
import { LAB_STATUSES, RESULT_FLAGS } from '../models/LabOrder.js';

const objectId = (label) => z.string().regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

// --- Test master ---
export const createLabTestSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  code: z.string().trim().min(2, 'Code is required').max(20).toUpperCase(),
  category: z.string().trim().max(60).optional(),
  sampleType: z.enum(SAMPLE_TYPES).optional(),
  unit: z.string().trim().max(20).optional(),
  referenceRange: z.string().trim().max(60).optional(),
  price: z.coerce.number().min(0).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export const updateLabTestSchema = createLabTestSchema.partial();

// --- Orders ---
export const createLabOrderSchema = z.object({
  patient: objectId('patient'),
  doctor: objectId('doctor').optional().nullable(),
  opdVisit: objectId('opdVisit').optional().nullable(),
  notes: z.string().trim().max(1000).optional(),
  // Either pick catalogue tests by id, or send ad-hoc names.
  tests: z.array(objectId('test')).optional(),
  items: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    unit: z.string().trim().max(20).optional(),
    referenceRange: z.string().trim().max(60).optional(),
    price: z.coerce.number().min(0).optional(),
  })).optional(),
}).refine((d) => (d.tests?.length || d.items?.length), {
  message: 'Add at least one test', path: ['tests'],
});

export const enterResultsSchema = z.object({
  items: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    unit: z.string().trim().max(20).optional(),
    referenceRange: z.string().trim().max(60).optional(),
    result: z.string().trim().max(120).optional(),
    flag: z.enum(RESULT_FLAGS).optional(),
    price: z.coerce.number().min(0).optional(),
  })).min(1, 'At least one result row is required'),
});

export const labStatusSchema = z.object({
  status: z.enum(LAB_STATUSES),
});

export const listLabQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().default(''),
  status: z.enum([...LAB_STATUSES, 'ALL']).optional().default('ALL'),
  patient: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
});
