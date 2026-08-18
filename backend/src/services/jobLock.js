// Leader election for scheduled jobs.
//
// The scheduler runs inside the web process, which means it runs in EVERY web
// process. On a single instance that is fine; on two, every patient gets two
// reminder emails, and on four, four. An email cannot be unsent, so this is not
// something that resolves itself.
//
// The lease is claimed with a single conditional update — the same shape used
// for beds and blood units elsewhere in this system — so exactly one process
// can hold it no matter how many ask at once. It expires, so a process that
// crashes mid-job releases the job rather than wedging it forever.
import crypto from 'crypto';
import { controlConnection } from '../db/connectionManager.js';
import { JOB_LOCK_SCHEMA } from '../models/JobLock.js';

// Identifies this process in the lease, so logs can say who is running what.
const HOLDER = `${process.env.HOSTNAME || 'local'}:${process.pid}:${crypto.randomBytes(3).toString('hex')}`;

function LockModel() {
  const conn = controlConnection();
  return conn.models.JobLock || conn.model('JobLock', JOB_LOCK_SCHEMA);
}

/**
 * Run `fn` only if this process can take the lease for `jobName`.
 *
 * @param ttlMs how long the lease is held. Must comfortably exceed the job's
 *              runtime, or a second process will take over while the first is
 *              still working — the failure this exists to prevent.
 * @returns the job's result, or { skipped: true } if another process holds it.
 */
export async function withJobLock(jobName, ttlMs, fn) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  const Lock = LockModel();

  try {
    // Take it if nobody holds it, or if the previous holder's lease has
    // lapsed. Both conditions live in the query, so two processes racing here
    // cannot both win.
    await Lock.findOneAndUpdate(
      { _id: jobName, $or: [{ expiresAt: { $lte: now } }, { expiresAt: null }] },
      { $set: { holder: HOLDER, expiresAt }, $setOnInsert: { _id: jobName } },
      { upsert: true, new: true }
    );
  } catch (err) {
    // A duplicate key here means another process inserted the lease a moment
    // ago — it holds it, and this one simply stands down. That is the lock
    // working, not an error.
    if (err?.code === 11000) return { skipped: true, reason: 'held by another instance' };
    throw err;
  }

  try {
    return await fn();
  } finally {
    // Release immediately rather than waiting out the lease, so a job that
    // finishes early doesn't block the next scheduled run.
    await Lock.updateOne(
      { _id: jobName, holder: HOLDER },
      { $set: { expiresAt: new Date(), lastRunAt: new Date() } }
    ).catch(() => {});
  }
}

export const lockHolderId = () => HOLDER;
