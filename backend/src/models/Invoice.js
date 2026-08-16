import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { Counter } from './Counter.js';

export const INVOICE_ITEM_CATEGORIES = [
  'CONSULTATION', 'ROOM', 'BED', 'LABORATORY', 'RADIOLOGY', 'MEDICINE', 'PROCEDURE', 'SURGERY', 'OTHER',
];
export const INVOICE_STATUSES = ['PENDING', 'PARTIAL', 'PAID', 'REFUNDED', 'CANCELLED'];

export const INVOICE_ITEM_SOURCES = ['LAB_ORDER', 'RAD_ORDER', 'DISPENSE'];

const invoiceItemSchema = new mongoose.Schema(
  {
    category: { type: String, enum: INVOICE_ITEM_CATEGORIES, default: 'OTHER' },
    description: { type: String, required: true, trim: true },
    quantity: { type: Number, min: 1, default: 1 },
    unitPrice: { type: Number, min: 0, default: 0 },
    amount: { type: Number, min: 0, default: 0 },
    // Set when this line came from a "suggested charge" (lab/rad/pharmacy) —
    // lets billingSuggestions() avoid offering the same charge twice.
    sourceType: { type: String, enum: INVOICE_ITEM_SOURCES, default: null },
    sourceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, unique: true, index: true }, // INV-YYYY-000001
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    items: { type: [invoiceItemSchema], default: [] },
    subtotal: { type: Number, min: 0, default: 0 },
    discount: { type: Number, min: 0, default: 0 },      // flat amount
    taxPercent: { type: Number, min: 0, max: 100, default: 0 },
    tax: { type: Number, min: 0, default: 0 },
    grandTotal: { type: Number, min: 0, default: 0 },
    paidAmount: { type: Number, min: 0, default: 0 },
    dueAmount: { type: Number, default: 0 },
    status: { type: String, enum: INVOICE_STATUSES, default: 'PENDING', index: true },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Recompute all derived money fields from items + discount + tax + paidAmount.
invoiceSchema.methods.recompute = function () {
  this.items.forEach((it) => { it.amount = Math.round(it.quantity * it.unitPrice * 100) / 100; });
  this.subtotal = Math.round(this.items.reduce((s, it) => s + it.amount, 0) * 100) / 100;
  const taxable = Math.max(0, this.subtotal - this.discount);
  this.tax = Math.round(taxable * (this.taxPercent / 100) * 100) / 100;
  this.grandTotal = Math.round((taxable + this.tax) * 100) / 100;
  this.dueAmount = Math.round((this.grandTotal - this.paidAmount) * 100) / 100;

  if (this.status === 'REFUNDED' || this.status === 'CANCELLED') return;
  if (this.paidAmount <= 0) this.status = 'PENDING';
  else if (this.paidAmount < this.grandTotal) this.status = 'PARTIAL';
  else this.status = 'PAID';
};

invoiceSchema.pre('save', async function (next) {
  if (this.invoiceNo) return next();
  try {
    const year = new Date().getFullYear();
    const seq = await Counter.next(`invoice-${year}`);
    this.invoiceNo = `INV-${year}-${String(seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

register("Invoice", invoiceSchema);
export const Invoice = tenantModel("Invoice");
