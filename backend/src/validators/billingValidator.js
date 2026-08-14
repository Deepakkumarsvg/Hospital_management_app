import { z } from 'zod';
import { INVOICE_ITEM_CATEGORIES } from '../models/Invoice.js';
import { PAYMENT_METHODS } from '../models/Payment.js';

const objectId = (label) => z.string().regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

const itemSchema = z.object({
  category: z.enum(INVOICE_ITEM_CATEGORIES).optional(),
  description: z.string().trim().min(1, 'Description is required').max(200),
  quantity: z.coerce.number().min(1).optional(),
  unitPrice: z.coerce.number().min(0),
});

export const createInvoiceSchema = z.object({
  patient: objectId('patient'),
  items: z.array(itemSchema).min(1, 'Add at least one line item'),
  discount: z.coerce.number().min(0).optional(),
  taxPercent: z.coerce.number().min(0).max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const updateInvoiceSchema = z.object({
  items: z.array(itemSchema).min(1).optional(),
  discount: z.coerce.number().min(0).optional(),
  taxPercent: z.coerce.number().min(0).max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
  status: z.enum(['REFUNDED', 'CANCELLED']).optional(),
});

export const recordPaymentSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  method: z.enum(PAYMENT_METHODS).optional(),
  transactionId: z.string().trim().max(80).optional(),
  note: z.string().trim().max(300).optional(),
});

export const listInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().default(''),
  status: z.enum(['PENDING', 'PARTIAL', 'PAID', 'REFUNDED', 'CANCELLED', 'ALL']).optional().default('ALL'),
  patient: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
});
