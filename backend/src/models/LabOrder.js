import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { Counter } from './Counter.js';

export const LAB_STATUSES = ['ORDERED', 'SAMPLE_COLLECTED', 'PROCESSING', 'COMPLETED', 'VERIFIED', 'CANCELLED'];
export const RESULT_FLAGS = ['NORMAL', 'HIGH', 'LOW', 'ABNORMAL'];

// Allowed forward transitions (enforced in the service).
export const LAB_TRANSITIONS = {
  ORDERED: ['SAMPLE_COLLECTED', 'CANCELLED'],
  SAMPLE_COLLECTED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['VERIFIED'],
  VERIFIED: [],
  CANCELLED: [],
};

// One test line within an order (result filled during Result Entry).
const orderItemSchema = new mongoose.Schema(
  {
    test: { type: mongoose.Schema.Types.ObjectId, ref: 'LabTest', default: null },
    name: { type: String, required: true, trim: true },
    unit: { type: String, trim: true, default: '' },
    referenceRange: { type: String, trim: true, default: '' },
    result: { type: String, trim: true, default: '' },
    flag: { type: String, enum: RESULT_FLAGS, default: 'NORMAL' },
    price: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const labOrderSchema = new mongoose.Schema(
  {
    orderNo: { type: String, unique: true, index: true }, // LAB-YYYY-000001
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null }, // ordering doctor
    opdVisit: { type: mongoose.Schema.Types.ObjectId, ref: 'OPDVisit', default: null },
    items: { type: [orderItemSchema], default: [] },
    status: { type: String, enum: LAB_STATUSES, default: 'ORDERED', index: true },
    notes: { type: String, trim: true, default: '' },

    sampleCollectedAt: { type: Date, default: null },
    resultEnteredAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

labOrderSchema.virtual('totalPrice').get(function () {
  return (this.items || []).reduce((sum, i) => sum + (i.price || 0), 0);
});

labOrderSchema.pre('save', async function (next) {
  if (this.orderNo) return next();
  try {
    const year = new Date().getFullYear();
    const seq = await Counter.next(`lab-${year}`);
    this.orderNo = `LAB-${year}-${String(seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

register("LabOrder", labOrderSchema);
export const LabOrder = tenantModel("LabOrder");
