import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { Counter } from './Counter.js';

export const OPD_STATUSES = ['OPEN', 'COMPLETED', 'CANCELLED'];
export const MED_ROUTES = ['ORAL', 'IV', 'IM', 'TOPICAL', 'INHALED', 'OTHER'];

// A single prescribed drug line (embedded in the visit).
const prescriptionItemSchema = new mongoose.Schema(
  {
    medicine: { type: String, required: true, trim: true },
    dosage: { type: String, trim: true, default: '' },      // e.g. "500 mg"
    frequency: { type: String, trim: true, default: '' },   // e.g. "1-0-1"
    duration: { type: String, trim: true, default: '' },    // e.g. "5 days"
    route: { type: String, enum: MED_ROUTES, default: 'ORAL' },
    instructions: { type: String, trim: true, default: '' }, // e.g. "After food"
    quantity: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const vitalsSchema = new mongoose.Schema(
  {
    bp: { type: String, trim: true, default: '' },          // "120/80"
    pulse: { type: Number, default: null },                 // bpm
    temperature: { type: Number, default: null },           // °F
    spo2: { type: Number, default: null },                  // %
    weight: { type: Number, default: null },                // kg
    height: { type: Number, default: null },                // cm
    respiratoryRate: { type: Number, default: null },
  },
  { _id: false }
);

const opdVisitSchema = new mongoose.Schema(
  {
    visitNo: { type: String, unique: true, index: true }, // OPD-YYYY-000001
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
    visitDate: { type: Date, default: Date.now },

    vitals: { type: vitalsSchema, default: () => ({}) },
    symptoms: { type: String, trim: true, default: '' },
    diagnosis: { type: String, trim: true, default: '' },
    icdCode: { type: String, trim: true, uppercase: true, default: '' }, // ICD-10 e.g. J06.9
    clinicalNotes: { type: String, trim: true, default: '' },
    prescription: { type: [prescriptionItemSchema], default: [] },
    followUpDate: { type: Date, default: null },

    status: { type: String, enum: OPD_STATUSES, default: 'OPEN', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

opdVisitSchema.pre('save', async function (next) {
  if (this.visitNo) return next();
  try {
    const year = new Date().getFullYear();
    const seq = await Counter.next(`opd-${year}`);
    this.visitNo = `OPD-${year}-${String(seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

register("OPDVisit", opdVisitSchema);
export const OPDVisit = tenantModel("OPDVisit");
