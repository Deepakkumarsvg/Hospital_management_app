import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

export const SAMPLE_TYPES = ['BLOOD', 'URINE', 'STOOL', 'SWAB', 'TISSUE', 'FLUID', 'OTHER'];

// Test Master — the catalogue of orderable lab tests.
const labTestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    category: { type: String, trim: true, default: 'General' }, // e.g. Hematology, Biochemistry
    sampleType: { type: String, enum: SAMPLE_TYPES, default: 'BLOOD' },
    unit: { type: String, trim: true, default: '' },            // e.g. g/dL
    referenceRange: { type: String, trim: true, default: '' },  // e.g. 13-17
    price: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

register("LabTest", labTestSchema);
export const LabTest = tenantModel("LabTest");
