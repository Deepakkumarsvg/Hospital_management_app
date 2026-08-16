import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'];

const attendanceSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    date: { type: Date, required: true },
    status: { type: String, enum: ATTENDANCE_STATUSES, default: 'PRESENT' },
    checkIn: { type: String, default: '' },
    checkOut: { type: String, default: '' },
    note: { type: String, trim: true, default: '' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Hours actually worked, derived from the "HH:mm" check-in/check-out pair.
// Null when either end is missing or unparseable — the pair is free-text, so
// a partially-filled row shouldn't invent a number.
attendanceSchema.virtual('hoursWorked').get(function () {
  const parse = (t) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const inM = parse(this.checkIn);
  const outM = parse(this.checkOut);
  if (inM == null || outM == null) return null;
  // A check-out before check-in means an overnight shift.
  const mins = outM >= inM ? outM - inM : (24 * 60 - inM) + outM;
  return Math.round((mins / 60) * 100) / 100;
});

// One attendance record per employee per day.
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

register("Attendance", attendanceSchema);
export const Attendance = tenantModel("Attendance");
