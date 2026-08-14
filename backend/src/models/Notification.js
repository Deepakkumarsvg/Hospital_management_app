import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

// In-app notification. Targeted to a specific user and/or a role.
// Architecture kept channel-agnostic so email/SMS/WhatsApp can be added later.
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    role: { type: String, default: null },
    type: { type: String, default: 'INFO' }, // APPOINTMENT, BILLING, STOCK, INFO…
    title: { type: String, required: true },
    message: { type: String, default: '' },
    link: { type: String, default: '' },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

notificationSchema.index({ createdAt: -1 });

register("Notification", notificationSchema);
export const Notification = tenantModel("Notification");
