import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

export const MODALITIES = ['XRAY', 'CT', 'MRI', 'ULTRASOUND', 'ECG', 'MAMMOGRAPHY', 'OTHER'];

// Radiology test catalogue.
const radiologyTestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    modality: { type: String, enum: MODALITIES, default: 'XRAY' },
    bodyPart: { type: String, trim: true, default: '' },
    price: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

register("RadiologyTest", radiologyTestSchema);
export const RadiologyTest = tenantModel("RadiologyTest");
