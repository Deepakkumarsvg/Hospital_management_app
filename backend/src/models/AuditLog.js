import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

// Append-only record of important actions across the system.
//
// "Immutable" used to be a claim in a comment with nothing behind it: any code
// path could have updated or deleted an entry. An audit trail that can be
// quietly edited is worth very little in the situation it exists for, so the
// hooks below refuse writes other than inserts.
const auditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Snapshots — the account may be renamed, have its role changed, or be
    // deleted later, and the entry must still say who did this at the time.
    userName: { type: String, default: '' },
    userRole: { type: String, default: '' },
    action: { type: String, required: true },  // CREATE, UPDATE, DELETE, READ, LOGIN, PAYMENT…
    module: { type: String, required: true },  // Patient, Invoice, Appointment…
    recordId: { type: String, default: '' },
    description: { type: String, default: '' },
    ip: { type: String, default: '' },
    // Correlates with the X-Request-Id on the HTTP log line for the same call.
    requestId: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ module: 1, action: 1 });
// "Everything that touched this patient's record", which is the query an
// investigation actually starts from.
auditLogSchema.index({ recordId: 1, createdAt: -1 });
// "Everything this member of staff did", the other half of the same question.
auditLogSchema.index({ user: 1, createdAt: -1 });

// --- Append-only enforcement -------------------------------------------------
//
// Mongoose middleware cannot stop a raw driver call, so this is a guard against
// application mistakes rather than a database-level permission. Revoking update
// and delete on the collection for the app's database user is what makes it
// airtight; this makes sure the application never even tries.
const REFUSE_UPDATE = function refuseUpdate(next) {
  next(new Error('Audit log entries are append-only and cannot be modified'));
};
const REFUSE_DELETE = function refuseDelete(next) {
  next(new Error('Audit log entries are append-only and cannot be deleted'));
};

for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne']) {
  auditLogSchema.pre(op, REFUSE_UPDATE);
}
for (const op of ['deleteOne', 'deleteMany', 'findOneAndDelete']) {
  auditLogSchema.pre(op, REFUSE_DELETE);
}
// Saving an already-persisted document is an update by another name.
auditLogSchema.pre('save', function guardResave(next) {
  if (!this.isNew) return next(new Error('Audit log entries are append-only and cannot be modified'));
  next();
});

register("AuditLog", auditLogSchema);
export const AuditLog = tenantModel("AuditLog");

// How long entries are kept. Retention is a deliberate decision rather than
// "forever by accident": clinical-access records are typically required for
// years, and the collection is the busiest write path in the system.
//
// Applied as a TTL index by ensureAuditRetention() rather than declared above,
// because changing a TTL on an existing index requires dropping it — and
// because a deployment that must keep records indefinitely needs to be able to
// turn it off (AUDIT_RETENTION_DAYS=0).
export const AUDIT_RETENTION_DAYS = Number(process.env.AUDIT_RETENTION_DAYS ?? 2555); // ~7 years
