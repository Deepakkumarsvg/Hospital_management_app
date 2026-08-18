import { z } from 'zod';
import { PRIORITY_REASONS } from '../models/OpdToken.js';

const objectId = (label) => z.string().regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);
const PRIORITY_CODES = PRIORITY_REASONS.map((p) => p.code);

export const issueTokenSchema = z.object({
  patient: objectId('patient'),
  doctor: objectId('doctor'),
  department: objectId('department').optional().nullable(),
  // Set when the patient had booked. Absent means a walk-in, which in most
  // Indian OPDs is the majority of the queue.
  appointment: objectId('appointment').optional().nullable(),
  priority: z.enum(PRIORITY_CODES).optional(),
  issuedAt: z.coerce.date().optional(),
  notes: z.string().trim().max(300).optional(),
});

export const startConsultationSchema = z.object({
  opdVisit: objectId('opdVisit').optional().nullable(),
});

export const skipTokenSchema = z.object({
  reason: z.string().trim().max(200).optional(),
});

export const queueQuerySchema = z.object({
  day: z.string().optional(),
});
