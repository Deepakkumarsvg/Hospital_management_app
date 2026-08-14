import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

// Immutable record of important actions across the system.
const auditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userName: { type: String, default: '' },  // snapshot (user may be deleted later)
    action: { type: String, required: true },  // e.g. CREATE, UPDATE, DELETE, LOGIN, PAYMENT
    module: { type: String, required: true },   // e.g. Patient, Invoice, Appointment
    recordId: { type: String, default: '' },
    description: { type: String, default: '' },
    ip: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: null }, // old/new snapshots etc.
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ module: 1, action: 1 });

register("AuditLog", auditLogSchema);
export const AuditLog = tenantModel("AuditLog");
