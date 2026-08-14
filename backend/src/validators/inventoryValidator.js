import { z } from 'zod';
import { ITEM_CATEGORIES } from '../models/InventoryItem.js';

const objectId = (label) => z.string().regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

// Items
export const createItemSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  code: z.string().trim().min(2, 'Code is required').max(20).toUpperCase(),
  category: z.enum(ITEM_CATEGORIES).optional(),
  unit: z.string().trim().max(20).optional(),
  minStock: z.coerce.number().min(0).optional(),
  unitPrice: z.coerce.number().min(0).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export const updateItemSchema = createItemSchema.partial();

// Manual stock adjust
export const adjustStockSchema = z.object({
  type: z.enum(['IN', 'OUT', 'ADJUST']),
  quantity: z.coerce.number().int(),
  reference: z.string().trim().max(80).optional(),
  note: z.string().trim().max(300).optional(),
});

// Vendors
export const createVendorSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  code: z.string().trim().min(2, 'Code is required').max(20).toUpperCase(),
  contactPerson: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().email('Invalid email').or(z.literal('')).optional(),
  address: z.string().trim().max(300).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export const updateVendorSchema = createVendorSchema.partial();

// Purchase orders
export const createPoSchema = z.object({
  vendor: objectId('vendor'),
  notes: z.string().trim().max(500).optional(),
  items: z.array(z.object({
    item: objectId('item'),
    quantity: z.coerce.number().int().min(1),
    unitPrice: z.coerce.number().min(0).optional(),
  })).min(1, 'Add at least one item'),
});

export const listItemsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().default(''),
  category: z.enum([...ITEM_CATEGORIES, 'ALL']).optional().default('ALL'),
  lowStock: z.enum(['true', 'false']).optional(),
});
