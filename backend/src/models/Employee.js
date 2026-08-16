import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { Counter } from './Counter.js';

const employeeSchema = new mongoose.Schema(
  {
    employeeCode: { type: String, unique: true, index: true }, // EMP-000001
    name: { type: String, required: true, trim: true },
    designation: { type: String, trim: true, default: '' },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    shift: { type: String, enum: ['MORNING', 'EVENING', 'NIGHT', 'GENERAL'], default: 'GENERAL' },
    joiningDate: { type: Date, default: Date.now },
    salary: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    // Set when someone leaves — INACTIVE alone doesn't say when or why.
    exitDate: { type: Date, default: null },
    exitReason: { type: String, trim: true, default: '' },
    // Annual entitlement, decremented as approved (non-unpaid) leave is taken.
    leaveBalance: {
      CASUAL: { type: Number, min: 0, default: 12 },
      SICK: { type: Number, min: 0, default: 12 },
      EARNED: { type: Number, min: 0, default: 15 },
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Email/phone are optional, so a plain unique index would collide across the
// many employees who leave them blank — only enforce uniqueness once a value
// is actually present.
employeeSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $gt: '' } } });
employeeSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $gt: '' } } });

employeeSchema.pre('save', async function (next) {
  if (this.employeeCode) return next();
  try {
    const seq = await Counter.next('employee');
    this.employeeCode = `EMP-${String(seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

register("Employee", employeeSchema);
export const Employee = tenantModel("Employee");
