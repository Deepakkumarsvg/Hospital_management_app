import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { Counter } from './Counter.js';
import { BLOOD_GROUPS } from './BloodDonor.js';

export const BLOOD_COMPONENTS = ['WHOLE_BLOOD', 'PRBC', 'PLATELETS', 'FFP', 'CRYOPRECIPITATE'];
export const UNIT_STATUSES = ['AVAILABLE', 'RESERVED', 'ISSUED', 'EXPIRED', 'DISCARDED'];

const bloodUnitSchema = new mongoose.Schema(
  {
    unitNo: { type: String, unique: true, index: true }, // BU-YYYY-000001
    bloodGroup: { type: String, enum: BLOOD_GROUPS, required: true, index: true },
    component: { type: String, enum: BLOOD_COMPONENTS, default: 'WHOLE_BLOOD' },
    donor: { type: mongoose.Schema.Types.ObjectId, ref: 'BloodDonor', default: null },
    collectionDate: { type: Date, default: Date.now },
    expiryDate: { type: Date, required: true, index: true },
    status: { type: String, enum: UNIT_STATUSES, default: 'AVAILABLE', index: true },
    // Set on issue.
    issuedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
    issuedAt: { type: Date, default: null },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

bloodUnitSchema.virtual('expired').get(function () {
  return this.expiryDate < new Date();
});

bloodUnitSchema.pre('save', async function (next) {
  if (this.unitNo) return next();
  try {
    const year = new Date().getFullYear();
    const seq = await Counter.next(`bloodunit-${year}`);
    this.unitNo = `BU-${year}-${String(seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

register("BloodUnit", bloodUnitSchema);
export const BloodUnit = tenantModel("BloodUnit");
