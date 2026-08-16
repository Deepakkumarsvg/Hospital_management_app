import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { Counter } from './Counter.js';

export const PAYMENT_METHODS = ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'INSURANCE', 'ONLINE'];
export const PAYMENT_TYPES = ['PAYMENT', 'REFUND'];

const paymentSchema = new mongoose.Schema(
  {
    receiptNo: { type: String, unique: true, index: true }, // RCPT-YYYY-000001
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    // `amount` is always stored positive — `type` says which direction it
    // moves the invoice's paidAmount (PAYMENT adds, REFUND subtracts).
    amount: { type: Number, min: 0, required: true },
    type: { type: String, enum: PAYMENT_TYPES, default: 'PAYMENT' },
    method: { type: String, enum: PAYMENT_METHODS, default: 'CASH' },
    transactionId: { type: String, trim: true, default: '' },
    note: { type: String, trim: true, default: '' },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

paymentSchema.pre('save', async function (next) {
  if (this.receiptNo) return next();
  try {
    const year = new Date().getFullYear();
    const seq = await Counter.next(`payment-${year}`);
    this.receiptNo = `RCPT-${year}-${String(seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

register("Payment", paymentSchema);
export const Payment = tenantModel("Payment");
