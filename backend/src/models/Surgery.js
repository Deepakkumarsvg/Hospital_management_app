import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { Counter } from './Counter.js';

export const SURGERY_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
export const SURGERY_TRANSITIONS = {
  SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

const surgerySchema = new mongoose.Schema(
  {
    surgeryNo: { type: String, unique: true, index: true }, // OT-YYYY-000001
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    theatre: { type: mongoose.Schema.Types.ObjectId, ref: 'OperationTheatre', required: true },
    surgeon: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    procedure: { type: String, required: true, trim: true },
    scheduledDate: { type: Date, required: true },
    scheduledTime: { type: String, default: '' },
    estimatedDuration: { type: Number, min: 15, default: 120 }, // minutes — used for theatre conflict checks
    // The 5-minute buckets this surgery occupies, derived from
    // scheduledDate + scheduledTime + estimatedDuration. This is what the
    // unique index below actually guards; never set it by hand.
    slots: { type: [String], default: [] },
    admission: { type: mongoose.Schema.Types.ObjectId, ref: 'IPDAdmission', default: null },
    anesthetist: { type: String, trim: true, default: '' },
    assistants: { type: String, trim: true, default: '' },
    preOpNotes: { type: String, trim: true, default: '' },
    surgeryNotes: { type: String, trim: true, default: '' },
    postOpNotes: { type: String, trim: true, default: '' },
    charges: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: SURGERY_STATUSES, default: 'SCHEDULED', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// The statuses that actually hold a theatre. A completed/cancelled surgery
// releases it, which is why the unique index below is partial.
const SLOT_HOLDING_STATUSES = ['SCHEDULED', 'IN_PROGRESS'];

// Theatre time is carved into fixed 5-minute buckets. Two surgeries that
// overlap by more than the bucket size are guaranteed to share at least one,
// which is what turns "do these intervals overlap" — something no unique index
// can express — into a plain equality collision that one can.
export const OT_SLOT_MINUTES = 5;

// Buckets are counted from the epoch rather than from midnight, so a surgery
// running past midnight simply continues into the next day's numbers and DST
// shifts can't renumber a day.
export function surgerySlots({ scheduledDate, scheduledTime, estimatedDuration } = {}) {
  if (!scheduledDate) return [];
  const [h, m] = String(scheduledTime || '00:00').split(':').map(Number);
  const start = new Date(scheduledDate);
  if (Number.isNaN(start.getTime())) return [];
  start.setHours(h || 0, m || 0, 0, 0);

  const bucketMs = OT_SLOT_MINUTES * 60000;
  const endMs = start.getTime() + Math.max(OT_SLOT_MINUTES, estimatedDuration || 120) * 60000;
  const first = Math.floor(start.getTime() / bucketMs);
  const last = Math.ceil(endMs / bucketMs) - 1;

  const slots = [];
  for (let b = first; b <= last; b += 1) slots.push(String(b));
  return slots;
}

// Keep slots in lockstep with the schedule on every write, including reschedules.
surgerySchema.pre('validate', function (next) {
  this.slots = surgerySlots(this);
  next();
});

// A theatre cannot host two surgeries at the same time. This is the real
// guard — the service-layer check that runs first only exists to produce a
// friendlier message; it cannot close the window between its read and the
// insert.
//
// Partial, so completed/cancelled surgeries drop out and free the theatre.
// `slots: {$exists: true}` excludes pre-migration documents that never had the
// field, so the index can be built on a live database.
surgerySchema.index(
  { theatre: 1, slots: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: SLOT_HOLDING_STATUSES },
      slots: { $exists: true },
    },
  }
);

surgerySchema.pre('save', async function (next) {
  if (this.surgeryNo) return next();
  try {
    const year = new Date().getFullYear();
    const seq = await Counter.next(`surgery-${year}`);
    this.surgeryNo = `OT-${year}-${String(seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

register("Surgery", surgerySchema);
export const Surgery = tenantModel("Surgery");
