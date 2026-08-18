import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

// The OPD queue.
//
// An appointment is a BOOKING — a claim on a slot, made in advance, possibly
// weeks ago. A token is a POSITION IN TODAY'S QUEUE. They are not the same
// thing, which is why this is its own record rather than a field on
// Appointment:
//
//  • Walk-ins have no appointment and still need a place in the line. In most
//    Indian OPDs they are the majority.
//  • Somebody who booked for 10:00 and arrived at 11:30 is behind the people
//    who arrived on time, whatever their slot said.
//  • The number that matters to a waiting patient — and to the display board
//    on the wall — is the token, not the appointment reference.
//
// Numbering is per doctor per day, because that is the queue a patient is
// actually standing in. A hospital-wide sequence would tell them nothing about
// how long they have left.

export const TOKEN_STATUSES = ['WAITING', 'CALLED', 'IN_CONSULTATION', 'COMPLETED', 'SKIPPED'];
export const TOKEN_TYPES = ['APPOINTMENT', 'WALK_IN'];

// Who goes ahead of the queue, and why.
//
// This is a real clinical and legal category, not a convenience: senior
// citizens and people with disabilities have statutory priority in Indian
// public healthcare, and a patient sent down from casualty is not waiting
// behind a routine follow-up. Encoding the reason means the jump is
// accountable rather than a favour somebody did at the desk.
export const PRIORITY_REASONS = [
  { code: 'NONE', label: 'Routine', rank: 3 },
  { code: 'SENIOR_CITIZEN', label: 'Senior citizen', rank: 2 },
  { code: 'DISABILITY', label: 'Person with disability', rank: 2 },
  { code: 'PREGNANCY', label: 'Pregnant', rank: 2 },
  { code: 'INFANT', label: 'Infant', rank: 2 },
  { code: 'EMERGENCY_REFERRAL', label: 'Referred from casualty', rank: 1 },
];

export const priorityRank = (code) =>
  PRIORITY_REASONS.find((p) => p.code === code)?.rank ?? 3;

const opdTokenSchema = new mongoose.Schema(
  {
    // Per doctor, per day: "A-014" reads as the fourteenth patient for that
    // doctor today.
    tokenNo: { type: Number, required: true },
    tokenLabel: { type: String, required: true },  // "OPD-014"

    // The calendar day this queue belongs to, as YYYY-MM-DD. A Date carries a
    // time component that makes it useless as an equality key, and the unique
    // index below needs an exact one.
    queueDay: { type: String, required: true, index: true },

    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },

    // Set when the token came from a booking rather than the walk-in desk.
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
    type: { type: String, enum: TOKEN_TYPES, default: 'WALK_IN' },

    priority: { type: String, default: 'NONE' },

    status: { type: String, enum: TOKEN_STATUSES, default: 'WAITING', index: true },
    issuedAt: { type: Date, default: Date.now },
    calledAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    // Set when the consultation actually opened, so the queue and the clinical
    // record are linked rather than being two accounts of the same visit.
    opdVisit: { type: mongoose.Schema.Types.ObjectId, ref: 'OPDVisit', default: null },

    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    calledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// One token number per doctor per day. Two people at two desks issuing at the
// same moment collide here rather than both handing out number 14.
opdTokenSchema.index({ doctor: 1, queueDay: 1, tokenNo: 1 }, { unique: true });
// The board reads this shape constantly.
opdTokenSchema.index({ doctor: 1, queueDay: 1, status: 1 });
opdTokenSchema.index({ queueDay: 1, status: 1 });

// How long this patient has been waiting, in minutes.
opdTokenSchema.virtual('waitingMinutes').get(function () {
  const end = this.startedAt || this.calledAt || new Date();
  return Math.max(0, Math.round((end - this.issuedAt) / 60000));
});

// How long the consultation itself took — the other half of "why is this
// queue slow", and the half a longer waiting-room does not fix.
opdTokenSchema.virtual('consultationMinutes').get(function () {
  if (!this.startedAt || !this.completedAt) return null;
  return Math.max(0, Math.round((this.completedAt - this.startedAt) / 60000));
});

register("OpdToken", opdTokenSchema);
export const OpdToken = tenantModel("OpdToken");

// The calendar day a queue belongs to. Local, not UTC — an OPD that opens at
// 08:00 IST would otherwise roll over mid-morning.
export function queueDayOf(date) {
  // Explicitly, not via a default parameter: a default only fires for
  // undefined, and every caller that means "today" passes null. Falling
  // through would make new Date(null) the epoch and search an empty queue in
  // January 1970.
  const d = date ? new Date(date) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
