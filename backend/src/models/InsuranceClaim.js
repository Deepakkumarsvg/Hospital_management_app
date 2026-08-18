import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { Counter } from './Counter.js';
import { paiseField, toJSONRupees } from '../utils/money.js';

export const CLAIM_STATUSES = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SETTLED'];

export const CLAIM_TRANSITIONS = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['SETTLED'],
  // A rejected claim can be reopened for correction (back to DRAFT, editable)
  // and resubmitted rather than being a permanent dead end.
  REJECTED: ['DRAFT'],
  SETTLED: [],
};

const historySchema = new mongoose.Schema(
  {
    status: String,
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, trim: true, default: '' }, // reason/remark recorded at this transition
  },
  { _id: false }
);

const insuranceClaimSchema = new mongoose.Schema(
  {
    claimNo: { type: String, unique: true, index: true }, // CLM-YYYY-000001
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
    insuranceCompany: { type: String, required: true, trim: true },
    policyNumber: { type: String, trim: true, default: '' },
    preAuthNo: { type: String, trim: true, default: '' },
    // Paise — these amounts are posted straight onto an invoice as a payment,
    // so they have to be in the same unit as the ledger. See utils/money.js.
    claimAmount: paiseField({ required: true }),
    approvedAmount: paiseField(),
    rejectedAmount: paiseField(),
    status: { type: String, enum: CLAIM_STATUSES, default: 'DRAFT', index: true },
    notes: { type: String, trim: true, default: '' },
    history: { type: [historySchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// The wire format is rupees — storage is the only thing that changed.
insuranceClaimSchema.set('toJSON', {
  virtuals: true,
  transform: toJSONRupees(['claimAmount', 'approvedAmount', 'rejectedAmount']),
});

insuranceClaimSchema.pre('save', async function (next) {
  if (this.claimNo) return next();
  try {
    const year = new Date().getFullYear();
    const seq = await Counter.next(`claim-${year}`);
    this.claimNo = `CLM-${year}-${String(seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

register("InsuranceClaim", insuranceClaimSchema);
export const InsuranceClaim = tenantModel("InsuranceClaim");
