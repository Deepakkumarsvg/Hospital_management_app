import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";

export const ITEM_CATEGORIES = ['CONSUMABLE', 'SURGICAL', 'EQUIPMENT', 'OFFICE', 'OTHER'];

const inventoryItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    category: { type: String, enum: ITEM_CATEGORIES, default: 'CONSUMABLE' },
    unit: { type: String, trim: true, default: 'piece' },
    currentStock: { type: Number, min: 0, default: 0 },
    minStock: { type: Number, min: 0, default: 5 },
    unitPrice: { type: Number, min: 0, default: 0 },
    lastPurchasePrice: { type: Number, min: 0, default: null },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

inventoryItemSchema.virtual('lowStock').get(function () {
  return this.currentStock <= this.minStock;
});

register("InventoryItem", inventoryItemSchema);
export const InventoryItem = tenantModel("InventoryItem");
