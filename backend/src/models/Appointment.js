import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { Counter } from './Counter.js';

export const APPOINTMENT_STATUSES = [
  'BOOKED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW',
];
export const APPOINTMENT_TYPES = ['NEW', 'FOLLOW_UP', 'EMERGENCY'];

// Allowed status transitions — enforced in the service layer.
export const STATUS_TRANSITIONS = {
  BOOKED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const appointmentSchema = new mongoose.Schema(
  {
    appointmentNo: { type: String, unique: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    date: { type: Date, required: true }, // appointment day
    time: { type: String, required: true }, // HH:mm slot
    // The calendar day of `date` as YYYY-MM-DD. `date` may carry a time
    // component depending on what the client sent, which makes it useless as
    // an equality key; the unique slot indexes below need an exact one.
    // Derived automatically — never set this by hand.
    slotDay: { type: String, default: '' },
    type: { type: String, enum: APPOINTMENT_TYPES, default: 'NEW' },
    status: { type: String, enum: APPOINTMENT_STATUSES, default: 'BOOKED', index: true },
    reason: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    // Telemedicine: when true, a Jitsi meeting room is generated for a video visit.
    teleconsult: { type: Boolean, default: false },
    meetingRoom: { type: String, trim: true, default: '' },
    // Reminder bookkeeping (set by the scheduler so a reminder is sent once).
    reminderSent: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// The statuses that actually hold a slot. A cancelled/completed appointment
// releases it, which is why the unique indexes below are partial.
const SLOT_HOLDING_STATUSES = ['BOOKED', 'CHECKED_IN', 'IN_PROGRESS'];

// Local calendar day of a Date — matches how the service layer builds its
// day-range queries (setHours(0,0,0,0)), so both agree on which day a slot
// belongs to.
export function toSlotDay(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Keep slotDay in lockstep with date on every write, including reschedules.
appointmentSchema.pre('validate', function (next) {
  if (this.date) this.slotDay = toSlotDay(this.date);
  next();
});

// Two appointments cannot hold the same slot. These are the real guard — the
// service-layer check that runs first only exists to produce a friendlier
// message; it cannot close the window between its read and the insert.
//
// Partial, so cancelled/completed/no-show appointments drop out and free the
// slot for rebooking. `slotDay: {$type:'string'}` excludes pre-migration
// documents that never had the field, so the index can be built on a live DB.
const slotPartialFilter = (extra) => ({
  partialFilterExpression: {
    status: { $in: SLOT_HOLDING_STATUSES },
    slotDay: { $type: 'string' },
    ...extra,
  },
});

appointmentSchema.index({ doctor: 1, slotDay: 1, time: 1 }, { unique: true, ...slotPartialFilter() });
appointmentSchema.index({ patient: 1, slotDay: 1, time: 1 }, { unique: true, ...slotPartialFilter() });

// Auto appointment number: APT-<year>-000001.
appointmentSchema.pre('save', async function (next) {
  if (this.appointmentNo) return next();
  try {
    const year = new Date().getFullYear();
    const seq = await Counter.next(`appointment-${year}`);
    this.appointmentNo = `APT-${year}-${String(seq).padStart(6, '0')}`;
    // Generate a unique Jitsi room for video consults.
    if (this.teleconsult && !this.meetingRoom) {
      this.meetingRoom = `HMS-${this.appointmentNo}`;
    }
    next();
  } catch (err) {
    next(err);
  }
});

register("Appointment", appointmentSchema);
export const Appointment = tenantModel("Appointment");
