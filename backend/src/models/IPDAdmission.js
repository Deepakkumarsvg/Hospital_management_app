import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { Counter } from './Counter.js';

export const IPD_STATUSES = ['ADMITTED', 'DISCHARGED', 'CANCELLED'];

const nursingNoteSchema = new mongoose.Schema(
  {
    note: { type: String, required: true, trim: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const ipdSchema = new mongoose.Schema(
  {
    admissionNo: { type: String, unique: true, index: true }, // IPD-YYYY-000001
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    admittingDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },

    ward: { type: mongoose.Schema.Types.ObjectId, ref: 'Ward', required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    bed: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed', required: true },

    admissionDate: { type: Date, default: Date.now },
    dischargeDate: { type: Date, default: null },
    reason: { type: String, trim: true, default: '' },
    diagnosis: { type: String, trim: true, default: '' },
    icdCode: { type: String, trim: true, uppercase: true, default: '' }, // ICD-10
    dischargeSummary: { type: String, trim: true, default: '' },

    status: { type: String, enum: IPD_STATUSES, default: 'ADMITTED', index: true },
    nursingNotes: { type: [nursingNoteSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Length-of-stay in days (whole days, min 0).
ipdSchema.virtual('lengthOfStayDays').get(function () {
  const end = this.dischargeDate ? this.dischargeDate.getTime() : Date.now();
  return Math.max(0, Math.floor((end - this.admissionDate.getTime()) / (24 * 60 * 60 * 1000)));
});

ipdSchema.pre('save', async function (next) {
  if (this.admissionNo) return next();
  try {
    const year = new Date().getFullYear();
    const seq = await Counter.next(`ipd-${year}`);
    this.admissionNo = `IPD-${year}-${String(seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

register("IPDAdmission", ipdSchema);
export const IPDAdmission = tenantModel("IPDAdmission");
