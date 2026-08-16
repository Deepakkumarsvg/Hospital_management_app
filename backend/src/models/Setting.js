import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

// Single hospital-wide configuration document (a singleton, key = 'hospital').
// Used for branding on documents (invoices, prescriptions), default tax, etc.
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: 'hospital' },
    hospitalName: { type: String, trim: true, default: 'City General Hospital' },
    tagline: { type: String, trim: true, default: 'Care with Compassion' },
    addressLine: { type: String, trim: true, default: '123 Health Street' },
    city: { type: String, trim: true, default: 'Mumbai' },
    state: { type: String, trim: true, default: 'Maharashtra' },
    pincode: { type: String, trim: true, default: '400001' },
    phone: { type: String, trim: true, default: '+91 22 0000 0000' },
    email: { type: String, trim: true, lowercase: true, default: 'info@hospital.example' },
    website: { type: String, trim: true, default: '' },
    registrationNo: { type: String, trim: true, default: '' },
    gstin: { type: String, trim: true, default: '' },
    currency: { type: String, trim: true, default: '₹' },
    defaultTaxPercent: { type: Number, min: 0, max: 100, default: 0 },
    invoiceFooter: { type: String, trim: true, default: 'Thank you for choosing us. Get well soon!' },
    logo: {
      storageKey: { type: String, default: '' },
      mimeType: { type: String, default: '' },
      originalName: { type: String, default: '' },
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

register("Setting", settingSchema);
export const Setting = tenantModel("Setting");
