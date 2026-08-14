import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const availabilitySchema = new mongoose.Schema(
  {
    day: { type: String, enum: WEEKDAYS, required: true },
    from: { type: String, default: '09:00' }, // HH:mm
    to: { type: String, default: '17:00' },
  },
  { _id: false }
);

const doctorSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, trim: true, default: '' },
    registrationNo: { type: String, required: true, unique: true, trim: true },
    specialization: { type: String, required: true, trim: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    qualification: { type: String, trim: true, default: '' },
    experienceYears: { type: Number, min: 0, default: 0 },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    consultationFee: { type: Number, min: 0, default: 0 },
    availability: { type: [availabilitySchema], default: [] },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    // Optional link to a login account with the DOCTOR role.
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

doctorSchema.virtual('fullName').get(function () {
  return `Dr. ${[this.firstName, this.lastName].filter(Boolean).join(' ')}`;
});

register("Doctor", doctorSchema);
export const Doctor = tenantModel("Doctor");
