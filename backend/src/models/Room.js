import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

const roomSchema = new mongoose.Schema(
  {
    ward: { type: mongoose.Schema.Types.ObjectId, ref: 'Ward', required: true, index: true },
    roomNo: { type: String, required: true, trim: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Room numbers unique within a ward.
roomSchema.index({ ward: 1, roomNo: 1 }, { unique: true });

register("Room", roomSchema);
export const Room = tenantModel("Room");
