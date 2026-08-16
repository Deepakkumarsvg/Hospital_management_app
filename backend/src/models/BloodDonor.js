import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const bloodDonorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    bloodGroup: { type: String, enum: BLOOD_GROUPS, required: true },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    age: { type: Number, min: 18, max: 65, default: null },
    address: { type: String, trim: true, default: '' },
    lastDonation: { type: Date, default: null },
    donationCount: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Standard eligibility rule: at least 90 days since the last donation.
export const DONATION_INTERVAL_DAYS = 90;
bloodDonorSchema.virtual('eligible').get(function () {
  if (!this.lastDonation) return true;
  const nextEligible = new Date(this.lastDonation).getTime() + DONATION_INTERVAL_DAYS * 24 * 3600 * 1000;
  return Date.now() >= nextEligible;
});
bloodDonorSchema.virtual('nextEligibleDate').get(function () {
  if (!this.lastDonation) return null;
  return new Date(new Date(this.lastDonation).getTime() + DONATION_INTERVAL_DAYS * 24 * 3600 * 1000);
});

register("BloodDonor", bloodDonorSchema);
export const BloodDonor = tenantModel("BloodDonor");
