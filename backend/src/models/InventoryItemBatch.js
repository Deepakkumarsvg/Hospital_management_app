import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

// A received stock lot for a general inventory item. Expiry is optional here
// (unlike Pharmacy's MedicineBatch) — equipment/office supplies typically
// don't expire, while surgical/consumable items often do.
const inventoryItemBatchSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true, index: true },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
    batchNo: { type: String, required: true, trim: true },
    expiryDate: { type: Date, default: null, index: true },
    quantity: { type: Number, min: 0, required: true },       // remaining
    receivedQuantity: { type: Number, min: 0, required: true }, // original
    unitPrice: { type: Number, min: 0, default: 0 },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

inventoryItemBatchSchema.virtual('expired').get(function () {
  return !!this.expiryDate && this.expiryDate < new Date();
});

inventoryItemBatchSchema.index({ item: 1, batchNo: 1 }, { unique: true });

register("InventoryItemBatch", inventoryItemBatchSchema);
export const InventoryItemBatch = tenantModel("InventoryItemBatch");
