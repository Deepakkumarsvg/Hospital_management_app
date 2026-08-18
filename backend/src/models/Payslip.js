import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { Counter } from './Counter.js';
import { paiseField, toJSONRupees } from '../utils/money.js';

export const PAYSLIP_STATUSES = ['GENERATED', 'PAID'];

// One payslip per employee per calendar month, computed from that month's
// attendance against the employee's basic salary.
const payslipSchema = new mongoose.Schema(
  {
    payslipNo: { type: String, unique: true, index: true }, // PAY-YYYY-MM-000001
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    month: { type: Number, min: 1, max: 12, required: true },
    year: { type: Number, required: true },
    // Paise, like every other amount. See utils/money.js.
    basicSalary: paiseField(),
    workingDays: { type: Number, min: 0, default: 0 },   // days in the month
    presentDays: { type: Number, min: 0, default: 0 },
    absentDays: { type: Number, min: 0, default: 0 },
    halfDays: { type: Number, min: 0, default: 0 },
    leaveDays: { type: Number, min: 0, default: 0 },
    unmarkedDays: { type: Number, min: 0, default: 0 },  // no attendance record at all — treated as unpaid
    grossPay: paiseField(),
    // Signed manual correction (bonus/deduction) — the one amount that may be
    // negative, so it opts out of the non-negative floor.
    adjustment: paiseField({ min: undefined }),
    adjustmentNote: { type: String, trim: true, default: '' },
    netPay: paiseField(),
    status: { type: String, enum: PAYSLIP_STATUSES, default: 'GENERATED', index: true },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// The wire format is rupees — storage is the only thing that changed.
payslipSchema.set('toJSON', {
  virtuals: true,
  transform: toJSONRupees(['basicSalary', 'grossPay', 'adjustment', 'netPay']),
});

payslipSchema.index({ employee: 1, month: 1, year: 1 }, { unique: true });

payslipSchema.pre('save', async function (next) {
  if (this.payslipNo) return next();
  try {
    const seq = await Counter.next(`payslip-${this.year}-${this.month}`);
    this.payslipNo = `PAY-${this.year}-${String(this.month).padStart(2, '0')}-${String(seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

register("Payslip", payslipSchema);
export const Payslip = tenantModel("Payslip");
