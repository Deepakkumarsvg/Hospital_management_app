import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

export const MEDICINE_UNITS = ['TABLET', 'CAPSULE', 'BOTTLE', 'VIAL', 'TUBE', 'SACHET', 'STRIP', 'UNIT'];

const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    genericName: { type: String, trim: true, default: '' },
    category: { type: String, trim: true, default: 'General' },
    manufacturer: { type: String, trim: true, default: '' },
    unit: { type: String, enum: MEDICINE_UNITS, default: 'TABLET' },
    mrp: { type: Number, min: 0, default: 0 },
    purchasePrice: { type: Number, min: 0, default: 0 },
    sellingPrice: { type: Number, min: 0, default: 0 },
    // Running stock, kept in sync by batch receipts and dispenses.
    currentStock: { type: Number, min: 0, default: 0 },
    minStock: { type: Number, min: 0, default: 10 },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

medicineSchema.virtual('lowStock').get(function () {
  return this.currentStock <= this.minStock;
});

register("Medicine", medicineSchema);
export const Medicine = tenantModel("Medicine");
