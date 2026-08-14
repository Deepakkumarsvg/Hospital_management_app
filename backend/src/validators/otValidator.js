import { z } from 'zod';
import { SURGERY_STATUSES } from '../models/Surgery.js';

const objectId = (label) => z.string().regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

export const createTheatreSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80),
  code: z.string().trim().min(2, 'Code is required').max(12).toUpperCase(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export const updateTheatreSchema = createTheatreSchema.partial();

export const createSurgerySchema = z.object({
  patient: objectId('patient'),
  theatre: objectId('theatre'),
  surgeon: objectId('surgeon'),
  procedure: z.string().trim().min(2, 'Procedure is required').max(200),
  scheduledDate: z.coerce.date(),
  scheduledTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm').optional().or(z.literal('')),
  anesthetist: z.string().trim().max(120).optional(),
  assistants: z.string().trim().max(200).optional(),
  preOpNotes: z.string().trim().max(2000).optional(),
  charges: z.coerce.number().min(0).optional(),
});

export const updateSurgerySchema = z.object({
  procedure: z.string().trim().min(2).max(200).optional(),
  scheduledDate: z.coerce.date().optional(),
  scheduledTime: z.string().optional(),
  anesthetist: z.string().trim().max(120).optional(),
  assistants: z.string().trim().max(200).optional(),
  preOpNotes: z.string().trim().max(2000).optional(),
  surgeryNotes: z.string().trim().max(4000).optional(),
  postOpNotes: z.string().trim().max(4000).optional(),
  charges: z.coerce.number().min(0).optional(),
});

export const surgeryStatusSchema = z.object({ status: z.enum(SURGERY_STATUSES) });

export const listSurgeryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum([...SURGERY_STATUSES, 'ALL']).optional().default('ALL'),
});
