import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { Counter } from './Counter.js';

export const SURGERY_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
export const SURGERY_TRANSITIONS = {
  SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

const surgerySchema = new mongoose.Schema(
  {
    surgeryNo: { type: String, unique: true, index: true }, // OT-YYYY-000001
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    theatre: { type: mongoose.Schema.Types.ObjectId, ref: 'OperationTheatre', required: true },
    surgeon: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    procedure: { type: String, required: true, trim: true },
    scheduledDate: { type: Date, required: true },
    scheduledTime: { type: String, default: '' },
    anesthetist: { type: String, trim: true, default: '' },
    assistants: { type: String, trim: true, default: '' },
    preOpNotes: { type: String, trim: true, default: '' },
    surgeryNotes: { type: String, trim: true, default: '' },
    postOpNotes: { type: String, trim: true, default: '' },
    charges: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: SURGERY_STATUSES, default: 'SCHEDULED', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

surgerySchema.pre('save', async function (next) {
  if (this.surgeryNo) return next();
  try {
    const year = new Date().getFullYear();
    const seq = await Counter.next(`surgery-${year}`);
    this.surgeryNo = `OT-${year}-${String(seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

register("Surgery", surgerySchema);
export const Surgery = tenantModel("Surgery");
