import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { Counter } from './Counter.js';
import { encryptedText } from '../utils/encryption.js';

// The emergency department.
//
// This is deliberately NOT "an OPD visit with a priority field". Three things
// make casualty a different problem from every other module here:
//
//  1. Order of treatment is decided by TRIAGE, not by arrival time and not by
//     an appointment. A patient who walks in bleeding goes ahead of one who has
//     been waiting two hours, and the queue has to say so by itself.
//  2. A patient may have no identity. Someone arriving unconscious from a road
//     accident needs a record and a wristband immediately; registration
//     catches up later. A module that requires a Patient row before it will
//     open a chart cannot be used in a resuscitation bay.
//  3. Certain presentations are medico-legal — assault, poisoning, burns, road
//     accidents — and reporting them to the police is a statutory duty, not a
//     workflow preference.

// Five-level acuity, the international standard shape (ESI/ATS/MTS all use it).
// Level 1 is the most urgent, which is why the queue sorts ascending.
//
// `targetMinutes` is the door-to-doctor time each level is supposed to meet.
// Without a target, "we triage patients" is an unmeasurable claim; with one,
// the department has a number it either hits or does not, which is what NABH
// and every clinical audit actually asks for.
export const TRIAGE_LEVELS = [
  { level: 1, code: 'RESUSCITATION', label: 'Resuscitation', colour: 'RED', targetMinutes: 0 },
  { level: 2, code: 'EMERGENT', label: 'Emergent', colour: 'ORANGE', targetMinutes: 10 },
  { level: 3, code: 'URGENT', label: 'Urgent', colour: 'YELLOW', targetMinutes: 30 },
  { level: 4, code: 'LESS_URGENT', label: 'Less urgent', colour: 'GREEN', targetMinutes: 60 },
  { level: 5, code: 'NON_URGENT', label: 'Non-urgent', colour: 'BLUE', targetMinutes: 120 },
];

export const TRIAGE_LEVEL_VALUES = TRIAGE_LEVELS.map((t) => t.level);
export const triageLevel = (level) => TRIAGE_LEVELS.find((t) => t.level === level) || null;

export const ARRIVAL_MODES = ['WALK_IN', 'AMBULANCE', 'POLICE', 'REFERRED', 'OTHER'];

// Where the patient went. Every emergency visit ends in exactly one of these,
// and which one it was is the department's primary outcome measure.
export const DISPOSITIONS = [
  'DISCHARGED',   // treated and sent home
  'ADMITTED',     // moved to a ward — creates an IPD admission
  'REFERRED',     // sent to another facility
  'LAMA',         // left against medical advice
  'ABSCONDED',    // left without telling anyone
  'DIED',
];

export const ER_STATUSES = ['WAITING', 'IN_TREATMENT', 'OBSERVATION', 'CLOSED'];

// Presentations that must be reported to the police under Indian law. Listing
// them means the system can prompt rather than relying on the clerk to
// remember at 3am.
export const MLC_NATURES = [
  'ROAD_TRAFFIC_ACCIDENT', 'ASSAULT', 'POISONING', 'BURNS', 'SUICIDE_ATTEMPT',
  'SEXUAL_ASSAULT', 'INDUSTRIAL_ACCIDENT', 'FIREARM', 'DROWNING', 'OTHER',
];

const vitalsSchema = new mongoose.Schema(
  {
    bp: { type: String, trim: true, default: '' },
    pulse: { type: Number, default: null },
    temperature: { type: Number, default: null },
    spo2: { type: Number, default: null },
    respiratoryRate: { type: Number, default: null },
    // Glasgow Coma Scale, 3–15. The single most important number in a head
    // injury, and meaningless if stored as free text.
    gcs: { type: Number, min: 3, max: 15, default: null },
    painScore: { type: Number, min: 0, max: 10, default: null },
  },
  { _id: false }
);

// Identity for a patient who has none yet.
//
// The record is opened against this and switched to a real Patient the moment
// somebody can name them — see identifyPatient(). Nothing about the clinical
// record changes when that happens.
const unidentifiedSchema = new mongoose.Schema(
  {
    alias: { type: String, trim: true, default: '' },     // "Unknown Male 1"
    estimatedAge: { type: Number, min: 0, max: 130, default: null },
    gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER', 'UNKNOWN'], default: 'UNKNOWN' },
    identifyingMarks: { type: String, trim: true, default: '' },
    broughtBy: { type: String, trim: true, default: '' },  // police, passer-by, ambulance crew
  },
  { _id: false }
);

const mlcSchema = new mongoose.Schema(
  {
    mlcNo: { type: String, trim: true, default: '' },
    nature: { type: String, enum: MLC_NATURES, default: 'OTHER' },
    policeStation: { type: String, trim: true, default: '' },
    informedAt: { type: Date, default: null },
    informedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Free-text account of the incident as reported — clinical narrative, so
    // encrypted at rest with everything else of that kind.
    details: encryptedText(),
  },
  { _id: false }
);

const emergencyVisitSchema = new mongoose.Schema(
  {
    erNo: { type: String, unique: true, index: true }, // ER-YYYY-000001

    // Nullable BY DESIGN. An unconscious patient gets a chart before they get
    // an identity; requiring a Patient row here would make the module unusable
    // for exactly the cases it exists for.
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null, index: true },
    unidentified: { type: unidentifiedSchema, default: null },

    arrivalTime: { type: Date, default: Date.now, index: true },
    arrivalMode: { type: String, enum: ARRIVAL_MODES, default: 'WALK_IN' },
    ambulanceTrip: { type: mongoose.Schema.Types.ObjectId, ref: 'AmbulanceTrip', default: null },
    chiefComplaint: { type: String, required: true, trim: true },

    // --- Triage ---------------------------------------------------------------
    triageLevel: { type: Number, enum: TRIAGE_LEVEL_VALUES, default: null, index: true },
    triageVitals: { type: vitalsSchema, default: () => ({}) },
    triageNotes: encryptedText(),
    triagedAt: { type: Date, default: null },
    triagedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Re-triage happens: a patient deteriorates in the waiting room. Keeping the
    // history is what lets that be reviewed afterwards.
    triageHistory: {
      type: [new mongoose.Schema({
        level: { type: Number, enum: TRIAGE_LEVEL_VALUES },
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reason: { type: String, trim: true, default: '' },
      }, { _id: false })],
      default: [],
    },

    // --- Treatment ------------------------------------------------------------
    attendingDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null, index: true },
    // When a clinician first saw the patient. Together with arrivalTime this is
    // the door-to-doctor time the triage targets are measured against.
    firstSeenAt: { type: Date, default: null },
    provisionalDiagnosis: { type: String, trim: true, default: '' },
    icdCode: { type: String, trim: true, uppercase: true, default: '' },
    treatmentNotes: encryptedText(),

    status: { type: String, enum: ER_STATUSES, default: 'WAITING', index: true },

    // --- Outcome --------------------------------------------------------------
    disposition: { type: String, enum: DISPOSITIONS, default: null },
    dispositionAt: { type: Date, default: null },
    dispositionBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    dispositionNotes: { type: String, trim: true, default: '' },
    // Set when the disposition was ADMITTED — links the two records so the ward
    // can see what happened downstairs.
    admission: { type: mongoose.Schema.Types.ObjectId, ref: 'IPDAdmission', default: null },
    referredTo: { type: String, trim: true, default: '' },

    // --- Medico-legal ---------------------------------------------------------
    isMLC: { type: Boolean, default: false, index: true },
    mlc: { type: mlcSchema, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true, getters: true }, toObject: { virtuals: true, getters: true } }
);

// Minutes from arrival to a clinician first seeing the patient — the number the
// triage target is judged against. Null while nobody has seen them yet.
emergencyVisitSchema.virtual('doorToDoctorMinutes').get(function () {
  if (!this.firstSeenAt || !this.arrivalTime) return null;
  return Math.max(0, Math.round((this.firstSeenAt - this.arrivalTime) / 60000));
});

// Whether that time met the target for the assigned acuity.
emergencyVisitSchema.virtual('metTriageTarget').get(function () {
  const target = triageLevel(this.triageLevel)?.targetMinutes;
  const actual = this.doorToDoctorMinutes;
  if (target === undefined || actual === null) return null;
  return actual <= target;
});

// How long the patient has been in the department.
emergencyVisitSchema.virtual('waitingMinutes').get(function () {
  const end = this.dispositionAt || new Date();
  return Math.max(0, Math.round((end - this.arrivalTime) / 60000));
});

// A name to show on the board, whoever the patient turns out to be.
emergencyVisitSchema.virtual('displayName').get(function () {
  if (this.patient?.firstName) {
    return [this.patient.firstName, this.patient.lastName].filter(Boolean).join(' ');
  }
  return this.unidentified?.alias || 'Unidentified';
});

// The queue: most urgent first, and within a level the longest wait first.
// This ordering IS the clinical rule — it is not a display preference, so it
// lives with the model rather than in whichever screen happens to render it.
//
// Untriaged patients sort as level 0, ahead of everything: somebody who has
// walked in and not yet been assessed is an unknown risk, and an unknown risk
// is the one you look at next.
emergencyVisitSchema.index({ status: 1, triageLevel: 1, arrivalTime: 1 });
emergencyVisitSchema.index({ arrivalTime: -1 });
emergencyVisitSchema.index({ isMLC: 1, arrivalTime: -1 });

emergencyVisitSchema.pre('save', async function (next) {
  if (this.erNo) return next();
  try {
    const year = new Date().getFullYear();
    const seq = await Counter.next(`emergency-${year}`);
    this.erNo = `ER-${year}-${String(seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

register("EmergencyVisit", emergencyVisitSchema);
export const EmergencyVisit = tenantModel("EmergencyVisit");
