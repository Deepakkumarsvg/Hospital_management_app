import { z } from 'zod';
import { MODALITIES } from '../models/RadiologyTest.js';
import { RAD_STATUSES } from '../models/RadiologyOrder.js';

const objectId = (label) => z.string().regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

export const createRadTestSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  code: z.string().trim().min(2, 'Code is required').max(20).toUpperCase(),
  modality: z.enum(MODALITIES).optional(),
  bodyPart: z.string().trim().max(60).optional(),
  price: z.coerce.number().min(0).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export const updateRadTestSchema = createRadTestSchema.partial();

export const createRadOrderSchema = z.object({
  patient: objectId('patient'),
  doctor: objectId('doctor').optional().nullable(),
  opdVisit: objectId('opdVisit').optional().nullable(),
  test: objectId('test').optional().nullable(),
  testName: z.string().trim().min(1).max(120).optional(),
  modality: z.enum(MODALITIES).optional(),
  notes: z.string().trim().max(1000).optional(),
}).refine((d) => d.test || d.testName, { message: 'Select a test or enter a name', path: ['test'] });

export const radReportSchema = z.object({
  findings: z.string().trim().max(4000).optional(),
  impression: z.string().trim().max(2000).optional(),
});

export const radStatusSchema = z.object({
  status: z.enum(RAD_STATUSES),
  scheduledAt: z.coerce.date().optional(),
});

export const listRadQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().default(''),
  status: z.enum([...RAD_STATUSES, 'ALL']).optional().default('ALL'),
  patient: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  doctor: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
});

export const exportRadQuerySchema = z.object({
  search: z.string().trim().optional().default(''),
  status: z.enum([...RAD_STATUSES, 'ALL']).optional().default('ALL'),
  patient: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  doctor: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  format: z.enum(['csv', 'xlsx']).optional().default('csv'),
});

export const listRadTestsQuerySchema = z.object({
  search: z.string().trim().optional().default(''),
  modality: z.enum(MODALITIES).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).optional().default('ALL'),
});
