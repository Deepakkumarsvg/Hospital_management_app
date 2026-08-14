import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

// Atomic sequence generator. One document per key (e.g. "uhid-2026").
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // the counter key
  seq: { type: Number, default: 0 },
});

counterSchema.statics.next = async function (key) {
  const doc = await this.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return doc.seq;
};

register("Counter", counterSchema);
export const Counter = tenantModel("Counter");
