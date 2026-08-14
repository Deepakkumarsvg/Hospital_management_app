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
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

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
