import { z } from 'zod';
import {
  TRIAGE_LEVEL_VALUES, ARRIVAL_MODES, DISPOSITIONS, ER_STATUSES, MLC_NATURES,
} from '../models/EmergencyVisit.js';

const objectId = (label) => z.string().regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

const vitalsSchema = z.object({
  bp: z.string().trim().max(20).optional(),
  pulse: z.coerce.number().min(0).max(300).optional().nullable(),
  temperature: z.coerce.number().min(80).max(115).optional().nullable(),
  spo2: z.coerce.number().min(0).max(100).optional().nullable(),
  respiratoryRate: z.coerce.number().min(0).max(90).optional().nullable(),
  // Glasgow Coma Scale only runs 3–15; anything else is a typo, not a reading.
  gcs: z.coerce.number().int().min(3).max(15).optional().nullable(),
  painScore: z.coerce.number().int().min(0).max(10).optional().nullable(),
}).partial();

const unidentifiedSchema = z.object({
  alias: z.string().trim().max(60).optional(),
  estimatedAge: z.coerce.number().int().min(0).max(130).optional().nullable(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'UNKNOWN']).optional(),
  identifyingMarks: z.string().trim().max(500).optional(),
  broughtBy: z.string().trim().max(120).optional(),
});

export const registerArrivalSchema = z.object({
  // Exactly one of these — enforced in the service, which can give a far more
  // useful message than a schema union can.
  patient: objectId('patient').optional().nullable(),
  unidentified: unidentifiedSchema.optional().nullable(),

  chiefComplaint: z.string().trim().min(2, 'Chief complaint is required').max(300),
  arrivalTime: z.coerce.date().optional(),
  arrivalMode: z.enum(ARRIVAL_MODES).optional(),
  ambulanceTrip: objectId('ambulanceTrip').optional().nullable(),

  // Triage can be done at the door, or a moment later by the triage nurse.
  triageLevel: z.coerce.number().refine((v) => TRIAGE_LEVEL_VALUES.includes(v), {
    message: `Triage level must be one of ${TRIAGE_LEVEL_VALUES.join(', ')}`,
  }).optional().nullable(),
  triageVitals: vitalsSchema.optional(),
  triageNotes: z.string().trim().max(2000).optional(),
});

export const triageSchema = z.object({
  level: z.coerce.number().refine((v) => TRIAGE_LEVEL_VALUES.includes(v), {
    message: `Triage level must be one of ${TRIAGE_LEVEL_VALUES.join(', ')}`,
  }),
  vitals: vitalsSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
  reason: z.string().trim().max(200).optional(),
});

export const startTreatmentSchema = z.object({ doctor: objectId('doctor') });

export const updateVisitSchema = z.object({
  chiefComplaint: z.string().trim().min(2).max(300).optional(),
  provisionalDiagnosis: z.string().trim().max(300).optional(),
  icdCode: z.string().trim().max(12).optional(),
  treatmentNotes: z.string().trim().max(8000).optional(),
  status: z.enum(ER_STATUSES).optional(),
});

export const identifySchema = z.object({ patient: objectId('patient') });

export const mlcSchema = z.object({
  nature: z.enum(MLC_NATURES),
  policeStation: z.string().trim().max(160).optional(),
  informedAt: z.coerce.date().optional(),
  details: z.string().trim().max(4000).optional(),
});

// Admitting needs a ward and a bed; every other outcome does not. Expressed
// here so the clinician is told what is missing before the visit is closed,
// rather than after it has been reopened by the compensating path.
export const disposeSchema = z.object({
  disposition: z.enum(DISPOSITIONS),
  notes: z.string().trim().max(1000).optional(),
  referredTo: z.string().trim().max(200).optional(),
  department: objectId('department').optional(),
  bed: objectId('bed').optional(),
  admittingDoctor: objectId('admittingDoctor').optional(),
}).refine((v) => v.disposition !== 'ADMITTED' || (v.department && v.bed), {
  message: 'Admitting from casualty needs a department and a bed',
  path: ['bed'],
}).refine((v) => v.disposition !== 'REFERRED' || !!v.referredTo, {
  message: 'Say where the patient is being referred to',
  path: ['referredTo'],
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().default(''),
  status: z.enum([...ER_STATUSES, 'ALL']).optional().default('ALL'),
  triageLevel: z.coerce.number().optional(),
  mlc: z.enum(['true', 'false']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const statsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});
