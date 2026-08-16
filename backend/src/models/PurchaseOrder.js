import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { Counter } from './Counter.js';

export const PO_STATUSES = ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'];

const poItemSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    name: { type: String, required: true },
    quantity: { type: Number, min: 1, required: true },
    receivedQuantity: { type: Number, min: 0, default: 0 },
    unitPrice: { type: Number, min: 0, default: 0 },
    lineTotal: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const purchaseOrderSchema = new mongoose.Schema(
  {
    poNo: { type: String, unique: true, index: true }, // PO-YYYY-000001
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    items: { type: [poItemSchema], default: [] },
    total: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: PO_STATUSES, default: 'ORDERED', index: true },
    orderedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

purchaseOrderSchema.pre('save', async function (next) {
  if (this.poNo) return next();
  try {
    const year = new Date().getFullYear();
    const seq = await Counter.next(`po-${year}`);
    this.poNo = `PO-${year}-${String(seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

register("PurchaseOrder", purchaseOrderSchema);
export const PurchaseOrder = tenantModel("PurchaseOrder");
