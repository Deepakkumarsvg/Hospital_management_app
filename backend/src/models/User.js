import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import bcrypt from 'bcryptjs';
import { ROLE_LIST } from '../config/roles.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    // Role name stored as string for fast checks; also referenced for future permission joins.
    role: { type: String, required: true, enum: ROLE_LIST },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    // Set for PATIENT-role accounts — links the login to its Patient profile.
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
      default: 'ACTIVE',
    },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Set a plain password; it gets hashed before persisting.
userSchema.methods.setPassword = async function (plain) {
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(plain, salt);
};

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

// Never leak the hash when serialising.
userSchema.methods.toSafeJSON = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    phone: this.phone,
    role: this.role,
    department: this.department,
    patient: this.patient,
    status: this.status,
    lastLoginAt: this.lastLoginAt,
  };
};

register("User", userSchema);
export const User = tenantModel("User");
