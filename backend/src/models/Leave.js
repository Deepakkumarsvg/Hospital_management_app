import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

export const LEAVE_TYPES = ['CASUAL', 'SICK', 'EARNED', 'UNPAID'];
export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

const leaveSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    type: { type: String, enum: LEAVE_TYPES, default: 'CASUAL' },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    reason: { type: String, trim: true, default: '' },
    status: { type: String, enum: LEAVE_STATUSES, default: 'PENDING', index: true },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

leaveSchema.virtual('days').get(function () {
  return Math.max(1, Math.round((this.toDate - this.fromDate) / (24 * 3600 * 1000)) + 1);
});

register("Leave", leaveSchema);
export const Leave = tenantModel("Leave");
