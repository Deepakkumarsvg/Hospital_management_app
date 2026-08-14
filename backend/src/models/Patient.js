import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { Counter } from './Counter.js';

export const GENDERS = ['MALE', 'FEMALE', 'OTHER'];
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'];

const emergencyContactSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    relation: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const addressSchema = new mongoose.Schema(
  {
    line: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    pincode: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const insuranceSchema = new mongoose.Schema(
  {
    provider: { type: String, trim: true, default: '' },
    policyNumber: { type: String, trim: true, default: '' },
    validTill: { type: Date, default: null },
  },
  { _id: false }
);

const patientSchema = new mongoose.Schema(
  {
    uhid: { type: String, unique: true, index: true }, // auto-generated: HMS-YYYY-000001
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, trim: true, default: '' },
    gender: { type: String, enum: GENDERS, required: true },
    dateOfBirth: { type: Date, required: true },
    phone: { type: String, required: true, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    bloodGroup: { type: String, enum: BLOOD_GROUPS, default: 'UNKNOWN' },
    address: { type: addressSchema, default: () => ({}) },
    emergencyContact: { type: emergencyContactSchema, default: () => ({}) },
    allergies: { type: String, trim: true, default: '' },
    medicalHistory: { type: String, trim: true, default: '' },
    insurance: { type: insuranceSchema, default: () => ({}) },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Convenience virtuals.
patientSchema.virtual('fullName').get(function () {
  return [this.firstName, this.lastName].filter(Boolean).join(' ');
});

patientSchema.virtual('age').get(function () {
  if (!this.dateOfBirth) return null;
  const diff = Date.now() - this.dateOfBirth.getTime();
  return Math.max(0, Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000)));
});

// Generate a unique UHID before first save: HMS-<year>-<6-digit seq>, year-scoped.
patientSchema.pre('save', async function (next) {
  if (this.uhid) return next();
  try {
    const year = new Date().getFullYear();
    const seq = await Counter.next(`uhid-${year}`);
    this.uhid = `HMS-${year}-${String(seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

register("Patient", patientSchema);
export const Patient = tenantModel("Patient");
