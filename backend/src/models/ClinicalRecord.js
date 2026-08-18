import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { encryptedText } from '../utils/encryption.js';

// The inpatient chart: what happened to this patient, over time.
//
// Three things were missing, and they are one story rather than three
// features — a ward round is exactly "read the obs, read the notes, check what
// was actually given":
//
//  • VITALS were a single embedded object on an OPD visit. A patient's blood
//    pressure at admission and their blood pressure now are the same field, so
//    the second overwrote the first and a trend could not exist. Deterioration
//    is visible in the SLOPE, not in any one reading.
//  • NOTES were a free-text array with no author role and no distinction
//    between a nurse's entry and a consultant's. A progress note and a nursing
//    observation are different documents with different weight.
//  • ADMINISTRATION was not recorded at all. The system knew what was
//    PRESCRIBED and, separately, what was DISPENSED from the pharmacy — but
//    not what was put into the patient, at what time, by whom. That gap is
//    where drug errors live.
//
// All three hang off an ENCOUNTER rather than off IPDAdmission specifically,
// so the same chart works for a casualty visit or a day case without being
// rebuilt.

export const ENCOUNTER_TYPES = ['IPD', 'ER', 'OPD'];

const encounterFields = {
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  encounterType: { type: String, enum: ENCOUNTER_TYPES, required: true },
  // The admission / emergency visit / OPD visit this belongs to. Not a ref to
  // one named collection, because the same chart serves all three.
  encounter: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
};

// ---------------------------------------------------------------------------
// Vitals — a time series, not a snapshot
// ---------------------------------------------------------------------------

export const VITAL_FIELDS = [
  'systolic', 'diastolic', 'pulse', 'temperature', 'spo2',
  'respiratoryRate', 'gcs', 'painScore', 'bloodSugar', 'weight',
];

const vitalsRecordSchema = new mongoose.Schema(
  {
    ...encounterFields,
    recordedAt: { type: Date, default: Date.now, required: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Blood pressure is stored as two numbers, not as the string "120/80".
    // A chart cannot plot a string, and "is this patient's systolic trending
    // down" is the question the field exists to answer.
    systolic: { type: Number, min: 0, max: 300, default: null },
    diastolic: { type: Number, min: 0, max: 200, default: null },
    pulse: { type: Number, min: 0, max: 300, default: null },
    temperature: { type: Number, min: 80, max: 115, default: null },  // °F
    spo2: { type: Number, min: 0, max: 100, default: null },
    respiratoryRate: { type: Number, min: 0, max: 90, default: null },
    gcs: { type: Number, min: 3, max: 15, default: null },
    painScore: { type: Number, min: 0, max: 10, default: null },
    bloodSugar: { type: Number, min: 0, max: 1000, default: null },   // mg/dL
    weight: { type: Number, min: 0, max: 500, default: null },        // kg

    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// The chart reads one encounter's observations in time order, every time.
vitalsRecordSchema.index({ encounter: 1, recordedAt: -1 });
vitalsRecordSchema.index({ patient: 1, recordedAt: -1 });

vitalsRecordSchema.virtual('bp').get(function () {
  return this.systolic && this.diastolic ? `${this.systolic}/${this.diastolic}` : '';
});

// The early-warning score most wards actually use.
//
// NEWS2 exists because deterioration is systemic: a patient can look
// acceptable on every single reading and still be in trouble once the readings
// are added up. Computing it here rather than in a screen means the number is
// the same wherever it is shown, and can be alerted on.
//
// Returns null when too little was recorded to score honestly — a partial
// score would read as reassurance the observations do not support.
vitalsRecordSchema.virtual('news2').get(function () {
  const parts = [];
  const score = (value, bands) => {
    if (value === null || value === undefined) return null;
    for (const [min, max, points] of bands) {
      if (value >= min && value <= max) return points;
    }
    return 3;
  };

  parts.push(score(this.respiratoryRate, [[12, 20, 0], [9, 11, 1], [21, 24, 2]]));
  parts.push(score(this.spo2, [[96, 100, 0], [94, 95, 1], [92, 93, 2]]));
  parts.push(score(this.systolic, [[111, 219, 0], [101, 110, 1], [91, 100, 2]]));
  parts.push(score(this.pulse, [[51, 90, 0], [41, 50, 1], [91, 110, 1], [111, 130, 2]]));
  parts.push(score(this.temperature, [[97.7, 100.4, 0], [96.8, 97.6, 1], [100.5, 102.2, 1], [102.3, 120, 2]]));

  const known = parts.filter((p) => p !== null);
  // Fewer than four of the five components is not a NEWS2 score.
  if (known.length < 4) return null;
  return known.reduce((s, p) => s + p, 0);
});

register("VitalsRecord", vitalsRecordSchema);
export const VitalsRecord = tenantModel("VitalsRecord");

// ---------------------------------------------------------------------------
// Clinical notes — typed, attributed, append-only once signed
// ---------------------------------------------------------------------------

export const NOTE_TYPES = [
  'PROGRESS',      // consultant / registrar ward-round entry
  'NURSING',       // nursing observation
  'PROCEDURE',     // something was done
  'HANDOVER',      // shift change
  'CONSULTATION',  // another specialty's opinion
  'DISCHARGE',     // discharge summary narrative
];

const clinicalNoteSchema = new mongoose.Schema(
  {
    ...encounterFields,
    noteType: { type: String, enum: NOTE_TYPES, required: true, index: true },
    // Clinical narrative — the most sensitive content in the record, so
    // encrypted at rest with everything else of that kind.
    body: encryptedText({ required: true }),

    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorRole: { type: String, default: '' },   // snapshot; roles change
    authoredAt: { type: Date, default: Date.now, required: true },

    // A signed note is part of the legal record and stops being editable.
    // Corrections are made by adding an addendum, never by rewriting history —
    // which is the whole difference between a medical record and a document.
    signedAt: { type: Date, default: null },
    addenda: {
      type: [new mongoose.Schema({
        body: encryptedText({ required: true }),
        author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        at: { type: Date, default: Date.now },
      }, { _id: true })],
      default: [],
    },
  },
  { timestamps: true, toJSON: { virtuals: true, getters: true }, toObject: { virtuals: true, getters: true } }
);

clinicalNoteSchema.index({ encounter: 1, authoredAt: -1 });
clinicalNoteSchema.index({ patient: 1, noteType: 1, authoredAt: -1 });

clinicalNoteSchema.virtual('isSigned').get(function () {
  return !!this.signedAt;
});

register("ClinicalNote", clinicalNoteSchema);
export const ClinicalNote = tenantModel("ClinicalNote");

// ---------------------------------------------------------------------------
// Medication administration record (MAR)
// ---------------------------------------------------------------------------

export const MED_ROUTES = ['ORAL', 'IV', 'IM', 'SC', 'TOPICAL', 'INHALED', 'RECTAL', 'OTHER'];

// Frequencies as a schedule the system can generate due-times from, rather
// than as the free text "1-0-1" that only a human can read.
export const MED_FREQUENCIES = {
  OD: { label: 'Once daily', times: ['08:00'] },
  BD: { label: 'Twice daily', times: ['08:00', '20:00'] },
  TDS: { label: 'Three times daily', times: ['08:00', '14:00', '20:00'] },
  QID: { label: 'Four times daily', times: ['06:00', '12:00', '18:00', '00:00'] },
  Q6H: { label: 'Every 6 hours', times: ['06:00', '12:00', '18:00', '00:00'] },
  Q8H: { label: 'Every 8 hours', times: ['06:00', '14:00', '22:00'] },
  HS: { label: 'At bedtime', times: ['22:00'] },
  STAT: { label: 'Immediately, once', times: [] },
  SOS: { label: 'As required', times: [] },
};

export const MED_ORDER_STATUSES = ['ACTIVE', 'HELD', 'STOPPED', 'COMPLETED'];

const medicationOrderSchema = new mongoose.Schema(
  {
    ...encounterFields,
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', default: null },
    // Free-text name kept alongside the reference: a drug ordered by a name
    // that is not in the formulary must still be recordable, and the name on
    // the chart must not change if the catalogue entry is later renamed.
    medicineName: { type: String, required: true, trim: true },

    dose: { type: String, required: true, trim: true },        // "500 mg"
    route: { type: String, enum: MED_ROUTES, default: 'ORAL' },
    frequency: { type: String, enum: Object.keys(MED_FREQUENCIES), required: true },
    instructions: { type: String, trim: true, default: '' },   // "after food"

    startAt: { type: Date, default: Date.now },
    endAt: { type: Date, default: null },

    prescribedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    status: { type: String, enum: MED_ORDER_STATUSES, default: 'ACTIVE', index: true },
    stoppedAt: { type: Date, default: null },
    stoppedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    stopReason: { type: String, trim: true, default: '' },

    // Recorded at the moment of prescribing. A warning that was shown and
    // overridden is a clinical decision worth keeping; one that is recomputed
    // later reflects today's data, not what the prescriber actually saw.
    allergyWarnings: { type: [String], default: [] },
    interactionWarnings: { type: [String], default: [] },
    overrideReason: { type: String, trim: true, default: '' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

medicationOrderSchema.index({ encounter: 1, status: 1 });
medicationOrderSchema.index({ patient: 1, status: 1 });

register("MedicationOrder", medicationOrderSchema);
export const MedicationOrder = tenantModel("MedicationOrder");

// Why a scheduled dose did not go in. "Not given" with no reason is the entry
// that makes a chart useless in an investigation.
export const ADMIN_STATUSES = ['GIVEN', 'REFUSED', 'OMITTED', 'WITHHELD', 'NOT_AVAILABLE'];

const medicationAdministrationSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicationOrder', required: true, index: true },
    ...encounterFields,

    // The slot this record answers for. Two nurses signing the same 08:00 dose
    // must collide rather than both succeed — the unique index below is what
    // makes double-administration a database error instead of a drug error.
    scheduledFor: { type: Date, required: true },
    administeredAt: { type: Date, default: null },
    administeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    status: { type: String, enum: ADMIN_STATUSES, required: true },
    // Required for anything other than GIVEN — enforced in the service.
    reason: { type: String, trim: true, default: '' },
    doseGiven: { type: String, trim: true, default: '' },  // if it differed from the order
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// One record per order per scheduled time. This is the guard that stops the
// same dose being signed twice.
medicationAdministrationSchema.index({ order: 1, scheduledFor: 1 }, { unique: true });
medicationAdministrationSchema.index({ encounter: 1, scheduledFor: -1 });

register("MedicationAdministration", medicationAdministrationSchema);
export const MedicationAdministration = tenantModel("MedicationAdministration");
