import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

export const AMBULANCE_STATUSES = ['AVAILABLE', 'ON_TRIP', 'MAINTENANCE'];

const ambulanceSchema = new mongoose.Schema(
  {
    vehicleNo: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: { type: String, enum: ['BASIC', 'ADVANCED', 'ICU'], default: 'BASIC' },
    driverName: { type: String, trim: true, default: '' },
    driverPhone: { type: String, trim: true, default: '' },
    status: { type: String, enum: AMBULANCE_STATUSES, default: 'AVAILABLE' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

register("Ambulance", ambulanceSchema);
export const Ambulance = tenantModel("Ambulance");
