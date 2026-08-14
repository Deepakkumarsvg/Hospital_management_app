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
