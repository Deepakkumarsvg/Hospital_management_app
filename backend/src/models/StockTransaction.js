import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

export const TXN_TYPES = ['IN', 'OUT', 'ADJUST'];

// An immutable audit record for every inventory stock change.
const stockTransactionSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true, index: true },
    type: { type: String, enum: TXN_TYPES, required: true },
    quantity: { type: Number, required: true },   // signed applied delta
    balanceAfter: { type: Number, required: true },
    reference: { type: String, trim: true, default: '' }, // e.g. PO number / reason
    note: { type: String, trim: true, default: '' },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

register("StockTransaction", stockTransactionSchema);
export const StockTransaction = tenantModel("StockTransaction");
