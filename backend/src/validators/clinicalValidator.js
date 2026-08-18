import { z } from 'zod';
import {
  ENCOUNTER_TYPES, NOTE_TYPES, MED_ROUTES, MED_FREQUENCIES, ADMIN_STATUSES,
} from '../models/ClinicalRecord.js';

const objectId = (label) => z.string().regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

const encounter = {
  patient: objectId('patient'),
  encounterType: z.enum(ENCOUNTER_TYPES),
  encounter: objectId('encounter'),
};

// The ranges are physiological, not arbitrary caps: a systolic of 400 or a GCS
// of 20 is a typing slip, and catching it at the keyboard is worth more than
// any amount of validation further down.
export const recordVitalsSchema = z.object({
  ...encounter,
  recordedAt: z.coerce.date().optional(),
  systolic: z.coerce.number().int().min(0).max(300).nullable().optional(),
  diastolic: z.coerce.number().int().min(0).max(200).nullable().optional(),
  pulse: z.coerce.number().int().min(0).max(300).nullable().optional(),
  temperature: z.coerce.number().min(80).max(115).nullable().optional(),
  spo2: z.coerce.number().int().min(0).max(100).nullable().optional(),
  respiratoryRate: z.coerce.number().int().min(0).max(90).nullable().optional(),
  gcs: z.coerce.number().int().min(3).max(15).nullable().optional(),
  painScore: z.coerce.number().int().min(0).max(10).nullable().optional(),
  bloodSugar: z.coerce.number().min(0).max(1000).nullable().optional(),
  weight: z.coerce.number().min(0).max(500).nullable().optional(),
  notes: z.string().trim().max(500).optional(),
}).refine((v) => !v.systolic || !v.diastolic || v.systolic > v.diastolic, {
  message: 'Systolic must be higher than diastolic',
  path: ['systolic'],
});

export const addNoteSchema = z.object({
  ...encounter,
  noteType: z.enum(NOTE_TYPES),
  body: z.string().trim().min(2, 'A note needs some content').max(20000),
  // Leaving a note unsigned is what a draft looks like. The default is signed,
  // because an entry nobody stands behind is not a clinical record.
  sign: z.boolean().optional(),
});

export const amendNoteSchema = z.object({
  body: z.string().trim().min(2).max(20000),
});

export const prescribeSchema = z.object({
  ...encounter,
  medicine: objectId('medicine').nullable().optional(),
  medicineName: z.string().trim().min(2, 'Medicine name is required').max(160),
  dose: z.string().trim().min(1, 'Dose is required').max(60),
  route: z.enum(MED_ROUTES).optional(),
  frequency: z.enum(Object.keys(MED_FREQUENCIES)),
  instructions: z.string().trim().max(300).optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().nullable().optional(),
  prescribedBy: objectId('prescribedBy'),
  // Only needed when a recorded allergy is being overridden. The service
  // refuses without it, and names the allergy it clashed with.
  overrideReason: z.string().trim().max(300).optional(),
});

export const stopOrderSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

export const administerSchema = z.object({
  scheduledFor: z.coerce.date(),
  status: z.enum(ADMIN_STATUSES),
  administeredAt: z.coerce.date().optional(),
  reason: z.string().trim().max(300).optional(),
  doseGiven: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const marQuerySchema = z.object({
  day: z.string().optional(),
});

export const notesQuerySchema = z.object({
  noteType: z.enum([...NOTE_TYPES, 'ALL']).optional(),
});
