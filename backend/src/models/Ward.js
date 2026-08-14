import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

export const WARD_TYPES = ['GENERAL', 'SEMI_PRIVATE', 'PRIVATE', 'ICU', 'EMERGENCY', 'PEDIATRIC', 'MATERNITY'];

const wardSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: { type: String, enum: WARD_TYPES, default: 'GENERAL' },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    floor: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

register("Ward", wardSchema);
export const Ward = tenantModel("Ward");
