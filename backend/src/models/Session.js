import mongoose from "mongoose";
import crypto from 'crypto';
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

// A refresh token that is actually revocable.
//
// The old scheme issued one long-lived JWT and nothing else: logging out just
// discarded it client-side, so a stolen token kept working for its full day and
// there was no way to end a session from the server. Sessions are now real rows
// — they can be listed, revoked one at a time, or revoked all at once.
//
// Only the token's HASH is stored, for the same reason passwords are hashed: a
// leaked sessions collection must not be a pile of working credentials.
const sessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    // Context, so a user looking at their sessions can recognise which is which.
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
    lastUsedAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
    // Set when this session was rotated into a successor, which is what makes a
    // replayed token detectable rather than merely useless.
    replacedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

// Expired sessions are of no further use; let MongoDB reap them.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

sessionSchema.virtual('active').get(function () {
  return !this.revokedAt && this.expiresAt > new Date();
});

register("Session", sessionSchema);
export const Session = tenantModel("Session");

export const hashRefreshToken = (raw) => crypto.createHash('sha256').update(String(raw)).digest('hex');
export const newRefreshToken = () => crypto.randomBytes(48).toString('base64url');
