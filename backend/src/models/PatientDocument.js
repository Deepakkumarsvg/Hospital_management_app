import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

export const DOCUMENT_CATEGORIES = [
  'ID_PROOF', 'LAB_REPORT', 'PRESCRIPTION', 'INSURANCE', 'RADIOLOGY', 'DISCHARGE', 'OTHER',
];

// Metadata only — the binary lives on the storage layer (disk/S3), never in Mongo.
const patientDocumentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    category: { type: String, enum: DOCUMENT_CATEGORIES, default: 'OTHER' },
    originalName: { type: String, required: true },
    storageKey: { type: String, required: true }, // relative path within upload root
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

register("PatientDocument", patientDocumentSchema);
export const PatientDocument = tenantModel("PatientDocument");
