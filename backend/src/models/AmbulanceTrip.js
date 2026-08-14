import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { Counter } from './Counter.js';

export const TRIP_STATUSES = ['ONGOING', 'COMPLETED', 'CANCELLED'];

const ambulanceTripSchema = new mongoose.Schema(
  {
    tripNo: { type: String, unique: true, index: true }, // AMB-YYYY-000001
    ambulance: { type: mongoose.Schema.Types.ObjectId, ref: 'Ambulance', required: true },
    patientName: { type: String, trim: true, default: '' },
    pickup: { type: String, trim: true, default: '' },
    drop: { type: String, trim: true, default: '' },
    purpose: { type: String, trim: true, default: '' },
    charges: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: TRIP_STATUSES, default: 'ONGOING', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

ambulanceTripSchema.pre('save', async function (next) {
  if (this.tripNo) return next();
  try {
    const year = new Date().getFullYear();
    const seq = await Counter.next(`amb-${year}`);
    this.tripNo = `AMB-${year}-${String(seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

register("AmbulanceTrip", ambulanceTripSchema);
export const AmbulanceTrip = tenantModel("AmbulanceTrip");
