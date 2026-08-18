import mongoose from "mongoose";

// A lease on a scheduled job, so exactly one process runs it.
//
// The scheduler used to run in every web process. With two instances behind a
// load balancer, every patient got two reminder emails; with four, four. The
// job is not idempotent from the patient's point of view — an email cannot be
// unsent — so "it'll sort itself out" was never true.
//
// This is a lease rather than a lock: it carries an expiry, so a process that
// dies mid-job does not wedge the job forever. Whoever finds an expired lease
// may take it.
//
// NOTE: this lives on the CONTROL database, not per tenant. The jobs iterate
// every tenant, so the lock has to be global — a per-tenant lock would let two
// instances each claim a different tenant's lock and both run the whole sweep.
const jobLockSchema = new mongoose.Schema(
  {
    _id: { type: String },          // the job name
    holder: { type: String, required: true },  // which process holds it
    expiresAt: { type: Date, required: true },
    lastRunAt: { type: Date, default: null },
  },
  { timestamps: true, _id: false }
);

// Let MongoDB clear leases nobody renewed. The expiry check below is what
// actually enforces correctness — this is only housekeeping.
jobLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export const JOB_LOCK_SCHEMA = jobLockSchema;
export const JOB_LOCK_COLLECTION = 'joblocks';
