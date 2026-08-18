import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { Counter } from './Counter.js';
import { encryptedText } from '../utils/encryption.js';

export const IPD_STATUSES = ['ADMITTED', 'DISCHARGED', 'CANCELLED'];

const nursingNoteSchema = new mongoose.Schema(
  {
    note: { type: String, required: true, trim: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

// One continuous occupancy of one bed. A transfer closes the current segment
// and opens a new one, so the admission carries a full record of where the
// patient was and when.
//
// Without this, a transfer simply overwrote `bed` and the earlier occupancy
// vanished — which meant bed charges could not be worked out at all for anyone
// who ever changed beds, since the nightly rate moves with the bed.
const bedStaySchema = new mongoose.Schema(
  {
    bed: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed', required: true },
    ward: { type: mongoose.Schema.Types.ObjectId, ref: 'Ward' },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
    // Snapshots taken when the patient moved in, so renaming or re-pricing a
    // bed never silently rewrites what an earlier patient was charged, and a
    // bill can be explained without joining back to the bed.
    bedNo: { type: String, default: '' },
    dailyCharge: { type: Number, min: 0, default: 0 },
    from: { type: Date, required: true },
    to: { type: Date, default: null }, // null = still in this bed
  },
  { _id: false }
);

const ipdSchema = new mongoose.Schema(
  {
    admissionNo: { type: String, unique: true, index: true }, // IPD-YYYY-000001
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    admittingDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },

    ward: { type: mongoose.Schema.Types.ObjectId, ref: 'Ward', required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    bed: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed', required: true },

    admissionDate: { type: Date, default: Date.now },
    dischargeDate: { type: Date, default: null },
    reason: { type: String, trim: true, default: '' },
    diagnosis: { type: String, trim: true, default: '' },
    icdCode: { type: String, trim: true, uppercase: true, default: '' }, // ICD-10
    // Encrypted at rest when configured — see utils/encryption.js.
    dischargeSummary: encryptedText(),

    status: { type: String, enum: IPD_STATUSES, default: 'ADMITTED', index: true },
    // Where the patient has been, in order. `bed` above is the current one.
    bedStays: { type: [bedStaySchema], default: [] },
    nursingNotes: { type: [nursingNoteSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true, getters: true }, toObject: { virtuals: true, getters: true } }
);

// Length-of-stay in days (whole days, min 0).
ipdSchema.virtual('lengthOfStayDays').get(function () {
  const end = this.dischargeDate ? this.dischargeDate.getTime() : Date.now();
  return Math.max(0, Math.floor((end - this.admissionDate.getTime()) / (24 * 60 * 60 * 1000)));
});

ipdSchema.pre('save', async function (next) {
  if (this.admissionNo) return next();
  try {
    const year = new Date().getFullYear();
    const seq = await Counter.next(`ipd-${year}`);
    this.admissionNo = `IPD-${year}-${String(seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

register("IPDAdmission", ipdSchema);
export const IPDAdmission = tenantModel("IPDAdmission");
