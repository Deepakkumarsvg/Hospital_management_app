import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { paiseField, toJSONRupees } from '../utils/money.js';

// A price list.
//
// The catalogue used to carry ONE price per service, which is not how any real
// hospital bills. The same CBC costs one thing to a cash patient, another under
// CGHS, another under a corporate contract and another to a TPA — and the
// difference is the entire commercial relationship with those payers. With a
// single price the only options were to bill everyone the same or to type the
// right number in by hand every time, and the second is where revenue leaks.
const tariffPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },       // "CGHS", "Corporate — Infosys"
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, trim: true, default: '' },

    // The plan used for a patient who has not been put on one. Exactly one plan
    // holds this at a time — setDefaultPlan() enforces it.
    isDefault: { type: Boolean, default: false },

    // A blanket adjustment applied to any service this plan does not price
    // explicitly. Most contracts are "the standard list, minus 10%" with a
    // handful of negotiated exceptions, and entering four hundred rates to
    // express that would guarantee they drift out of date.
    //
    // Signed: -10 is a 10% discount, +5 a 5% premium.
    baseAdjustmentPercent: { type: Number, min: -100, max: 100, default: 0 },

    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

register("TariffPlan", tariffPlanSchema);
export const TariffPlan = tenantModel("TariffPlan");

// What a plan can price. Each maps to a catalogue collection whose own price
// field is the fallback when the plan says nothing.
export const TARIFF_SERVICE_TYPES = ['LAB_TEST', 'RAD_TEST', 'BED', 'CONSULTATION', 'MEDICINE'];

// One negotiated price, for one service, under one plan.
const tariffRateSchema = new mongoose.Schema(
  {
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'TariffPlan', required: true, index: true },
    serviceType: { type: String, enum: TARIFF_SERVICE_TYPES, required: true },
    // The catalogue document this price is for: a LabTest, RadiologyTest, Bed,
    // Doctor (consultation) or Medicine.
    service: { type: mongoose.Schema.Types.ObjectId, required: true },
    // Paise, like every other amount. See utils/money.js.
    price: paiseField(),
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// One price per service per plan — a service with two prices under the same
// plan is a question with no answer.
tariffRateSchema.index({ plan: 1, serviceType: 1, service: 1 }, { unique: true });

tariffRateSchema.set('toJSON', { virtuals: true, transform: toJSONRupees(['price']) });

register("TariffRate", tariffRateSchema);
export const TariffRate = tenantModel("TariffRate");
