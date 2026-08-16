import { z } from 'zod';
import { ITEM_CATEGORIES } from '../models/InventoryItem.js';
import { PO_STATUSES } from '../models/PurchaseOrder.js';

const objectId = (label) => z.string().regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

// Items
export const createItemSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  code: z.string().trim().min(2, 'Code is required').max(20).toUpperCase(),
  category: z.enum(ITEM_CATEGORIES).optional(),
  unit: z.string().trim().max(20).optional(),
  minStock: z.coerce.number().min(0).optional(),
  unitPrice: z.coerce.number().min(0).optional(),
  lastPurchasePrice: z.coerce.number().min(0).optional(),
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
  status: z.enum(['DRAFT', 'ORDERED']).optional().default('ORDERED'),
  items: z.array(z.object({
    item: objectId('item'),
    quantity: z.coerce.number().int().min(1),
    unitPrice: z.coerce.number().min(0).optional(),
  })).min(1, 'Add at least one item'),
});

// Editing is only allowed while a PO is still DRAFT (enforced in the service).
export const updatePoSchema = z.object({
  vendor: objectId('vendor').optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(z.object({
    item: objectId('item'),
    quantity: z.coerce.number().int().min(1),
    unitPrice: z.coerce.number().min(0).optional(),
  })).min(1, 'Add at least one item').optional(),
});

export const receivePoSchema = z.object({
  // Omit to receive every line in full (backward-compatible full receipt);
  // pass specific lines to record a partial/short shipment. expiryDate is
  // optional per line — only meaningful for items that actually expire.
  items: z.array(z.object({
    item: objectId('item'),
    quantity: z.coerce.number().int().min(1),
    expiryDate: z.coerce.date().optional(),
  })).optional(),
});

export const listItemsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().default(''),
  category: z.enum([...ITEM_CATEGORIES, 'ALL']).optional().default('ALL'),
  lowStock: z.enum(['true', 'false']).optional(),
});

export const exportItemsQuerySchema = z.object({
  search: z.string().trim().optional().default(''),
  category: z.enum([...ITEM_CATEGORIES, 'ALL']).optional().default('ALL'),
  lowStock: z.enum(['true', 'false']).optional(),
  format: z.enum(['csv', 'xlsx']).optional().default('csv'),
});

export const exportVendorsQuerySchema = z.object({
  format: z.enum(['csv', 'xlsx']).optional().default('csv'),
});

export const listPoQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().default(''),
  status: z.enum([...PO_STATUSES, 'ALL']).optional().default('ALL'),
  vendor: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
});

export const exportPoQuerySchema = z.object({
  search: z.string().trim().optional().default(''),
  status: z.enum([...PO_STATUSES, 'ALL']).optional().default('ALL'),
  vendor: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  format: z.enum(['csv', 'xlsx']).optional().default('csv'),
});
