import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

export const BED_STATUSES = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE'];

const bedSchema = new mongoose.Schema(
  {
    bedNo: { type: String, required: true, trim: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    // Ward denormalised for fast bed-map queries / ward-level availability counts.
    ward: { type: mongoose.Schema.Types.ObjectId, ref: 'Ward', required: true, index: true },
    status: { type: String, enum: BED_STATUSES, default: 'AVAILABLE', index: true },
    dailyCharge: { type: Number, min: 0, default: 0 },
    // Set while OCCUPIED; points at the active IPD admission.
    currentAdmission: { type: mongoose.Schema.Types.ObjectId, ref: 'IPDAdmission', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

bedSchema.index({ room: 1, bedNo: 1 }, { unique: true });

register("Bed", bedSchema);
export const Bed = tenantModel("Bed");
