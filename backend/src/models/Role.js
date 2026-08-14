import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { ROLE_LIST } from '../config/roles.js';

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      enum: ROLE_LIST,
    },
    description: { type: String, default: '' },
    // Reserved for future fine-grained permissions (module:action strings).
    permissions: { type: [String], default: [] },
  },
  { timestamps: true }
);

register("Role", roleSchema);
export const Role = tenantModel("Role");
