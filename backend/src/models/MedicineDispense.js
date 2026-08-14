import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { Counter } from './Counter.js';

// A dispensing event (medicine issue). Each line records which batches were used.
const dispenseItemSchema = new mongoose.Schema(
  {
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
    name: { type: String, required: true },
    quantity: { type: Number, min: 1, required: true },
    sellingPrice: { type: Number, min: 0, default: 0 },
    lineTotal: { type: Number, min: 0, default: 0 },
    // Which batches were drawn from, for traceability.
    batches: [{ batchNo: String, quantity: Number }],
  },
  { _id: false }
);

const medicineDispenseSchema = new mongoose.Schema(
  {
    dispenseNo: { type: String, unique: true, index: true }, // PH-YYYY-000001
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
    opdVisit: { type: mongoose.Schema.Types.ObjectId, ref: 'OPDVisit', default: null },
    items: { type: [dispenseItemSchema], default: [] },
    total: { type: Number, min: 0, default: 0 },
    dispensedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

medicineDispenseSchema.pre('save', async function (next) {
  if (this.dispenseNo) return next();
  try {
    const year = new Date().getFullYear();
    const seq = await Counter.next(`dispense-${year}`);
    this.dispenseNo = `PH-${year}-${String(seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

register("MedicineDispense", medicineDispenseSchema);
export const MedicineDispense = tenantModel("MedicineDispense");
