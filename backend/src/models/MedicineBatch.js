import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

// A received stock lot for a medicine. Dispensing consumes `quantity` FEFO
// (first-expiry-first-out).
const medicineBatchSchema = new mongoose.Schema(
  {
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true, index: true },
    batchNo: { type: String, required: true, trim: true },
    expiryDate: { type: Date, required: true, index: true },
    quantity: { type: Number, min: 0, required: true },       // remaining
    receivedQuantity: { type: Number, min: 0, required: true }, // original
    purchasePrice: { type: Number, min: 0, default: 0 },
    mrp: { type: Number, min: 0, default: 0 },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

medicineBatchSchema.virtual('expired').get(function () {
  return this.expiryDate < new Date();
});

register("MedicineBatch", medicineBatchSchema);
export const MedicineBatch = tenantModel("MedicineBatch");
