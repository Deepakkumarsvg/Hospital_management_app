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

    // Tokens minted before this moment are rejected — so changing a password
    // (or an admin resetting it) actually kicks out anyone holding a stolen
    // JWT, instead of leaving them signed in until it expires on its own.
    passwordChangedAt: { type: Date, default: null },

    // Brute-force protection: consecutive failures lock the account for a
    // cooling-off window. Both reset on a successful login.
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },

    // Forgot-password: only the SHA-256 of the emailed token is stored, so a
    // database read can't be replayed into an account takeover.
    passwordResetTokenHash: { type: String, default: null, select: false },
    passwordResetExpires: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

// Set a plain password; it gets hashed before persisting. Stamps
// passwordChangedAt and clears any lockout/reset state, since every path that
// sets a password (self-service, admin reset, forgot-password) wants exactly
// that — keeping it here means no caller can forget a step.
userSchema.methods.setPassword = async function (plain) {
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(plain, salt);
  // Backdate a second: JWT `iat` is whole-second precision, so a token minted
  // in the same second as the change would otherwise look "older" and be
  // rejected — logging the user out of the session they just used.
  this.passwordChangedAt = new Date(Date.now() - 1000);
  this.failedLoginAttempts = 0;
  this.lockedUntil = null;
  this.passwordResetTokenHash = null;
  this.passwordResetExpires = null;
};

userSchema.methods.isLocked = function () {
  return !!this.lockedUntil && this.lockedUntil > new Date();
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
    createdAt: this.createdAt,
  };
};

register("User", userSchema);
export const User = tenantModel("User");
