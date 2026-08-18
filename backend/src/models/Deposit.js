import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { Counter } from './Counter.js';
import { paiseField, toJSONRupees } from '../utils/money.js';

// Money taken before the bill exists.
//
// Indian hospitals collect an advance at admission and draw the bill down
// against it. That is not a payment against an invoice — the invoice has not
// been raised yet, and at discharge whatever is left is the patient's money
// and has to go back. Recording it as a payment would put an unearned credit
// on a bill nobody has issued.
//
// So a deposit is its own ledger with three balances that must always add up:
//
//     amount = applied + refunded + available
//
// `available` is derived rather than stored, because a stored fourth number is
// a fourth number that can disagree with the other three.

export const DEPOSIT_STATUSES = ['ACTIVE', 'EXHAUSTED', 'CLOSED'];
export const DEPOSIT_METHODS = ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'ONLINE'];

// Every movement of the deposit, so the balance can always be explained.
const movementSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['COLLECTED', 'APPLIED', 'REFUNDED'], required: true },
    amount: paiseField({ required: true }),
    // Set on APPLIED — which bill this went to.
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
    method: { type: String, enum: DEPOSIT_METHODS, default: 'CASH' },
    reference: { type: String, trim: true, default: '' },
    note: { type: String, trim: true, default: '' },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const depositSchema = new mongoose.Schema(
  {
    depositNo: { type: String, unique: true, index: true }, // DEP-YYYY-000001
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    // Deposits are almost always taken against an admission, but a planned
    // surgery or a package can take one before the patient is admitted.
    admission: { type: mongoose.Schema.Types.ObjectId, ref: 'IPDAdmission', default: null, index: true },

    // Paise throughout. See utils/money.js.
    amount: paiseField({ required: true }),   // total ever collected
    applied: paiseField(),                    // drawn down onto invoices
    refunded: paiseField(),                   // given back

    movements: { type: [movementSchema], default: [] },
    status: { type: String, enum: DEPOSIT_STATUSES, default: 'ACTIVE', index: true },
    closedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// What is still the patient's, and still usable. Derived, never stored.
depositSchema.virtual('available').get(function () {
  return Math.max(0, this.amount - this.applied - this.refunded);
});

const MONEY_FIELDS = ['amount', 'applied', 'refunded', 'available'];
depositSchema.set('toJSON', {
  virtuals: true,
  transform: toJSONRupees(MONEY_FIELDS, { movements: ['amount'] }),
});

depositSchema.index({ patient: 1, status: 1 });

depositSchema.pre('save', async function (next) {
  if (this.depositNo) return next();
  try {
    const year = new Date().getFullYear();
    const seq = await Counter.next(`deposit-${year}`);
    this.depositNo = `DEP-${year}-${String(seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

register("Deposit", depositSchema);
export const Deposit = tenantModel("Deposit");
