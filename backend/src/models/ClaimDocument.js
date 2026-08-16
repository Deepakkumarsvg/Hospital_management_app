import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

export const CLAIM_DOCUMENT_CATEGORIES = ['PRE_AUTH', 'DISCHARGE_SUMMARY', 'BILL', 'POLICY', 'OTHER'];

// Metadata only — the binary lives on the storage layer (disk/S3), never in Mongo.
const claimDocumentSchema = new mongoose.Schema(
  {
    claim: { type: mongoose.Schema.Types.ObjectId, ref: 'InsuranceClaim', required: true, index: true },
    category: { type: String, enum: CLAIM_DOCUMENT_CATEGORIES, default: 'OTHER' },
    originalName: { type: String, required: true },
    storageKey: { type: String, required: true }, // relative path within upload root
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

register("ClaimDocument", claimDocumentSchema);
export const ClaimDocument = tenantModel("ClaimDocument");
