import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { Counter } from './Counter.js';
import { MODALITIES } from './RadiologyTest.js';

export const RAD_STATUSES = ['ORDERED', 'SCHEDULED', 'COMPLETED', 'REPORTED', 'CANCELLED'];

export const RAD_TRANSITIONS = {
  ORDERED: ['SCHEDULED', 'COMPLETED', 'CANCELLED'],
  SCHEDULED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['REPORTED'],
  REPORTED: [],
  CANCELLED: [],
};

const radiologyOrderSchema = new mongoose.Schema(
  {
    orderNo: { type: String, unique: true, index: true }, // RAD-YYYY-000001
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null },
    opdVisit: { type: mongoose.Schema.Types.ObjectId, ref: 'OPDVisit', default: null },
    test: { type: mongoose.Schema.Types.ObjectId, ref: 'RadiologyTest', default: null },
    testName: { type: String, required: true, trim: true },
    modality: { type: String, enum: MODALITIES, default: 'XRAY' },
    price: { type: Number, min: 0, default: 0 },

    status: { type: String, enum: RAD_STATUSES, default: 'ORDERED', index: true },
    scheduledAt: { type: Date, default: null },
    findings: { type: String, trim: true, default: '' },
    impression: { type: String, trim: true, default: '' },
    reportedAt: { type: Date, default: null },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

radiologyOrderSchema.pre('save', async function (next) {
  if (this.orderNo) return next();
  try {
    const year = new Date().getFullYear();
    const seq = await Counter.next(`rad-${year}`);
    this.orderNo = `RAD-${year}-${String(seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

register("RadiologyOrder", radiologyOrderSchema);
export const RadiologyOrder = tenantModel("RadiologyOrder");
