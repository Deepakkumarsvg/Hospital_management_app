import { z } from 'zod';
import { INVOICE_ITEM_CATEGORIES, INVOICE_ITEM_SOURCES } from '../models/Invoice.js';
import { PAYMENT_METHODS } from '../models/Payment.js';
import { zodPaise } from '../utils/money.js';
import { TAX_TREATMENTS, GST_RATES, GSTIN_PATTERN } from '../config/gst.js';

const objectId = (label) => z.string().regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

// Money arrives as rupees and reaches the service as paise. See utils/money.js.
const itemSchema = z.object({
  category: z.enum(INVOICE_ITEM_CATEGORIES).optional(),
  description: z.string().trim().min(1, 'Description is required').max(200),
  quantity: z.coerce.number().min(1).optional(),
  unitPrice: zodPaise(z.coerce.number().min(0)),
  // Present only when this line was added from a suggested charge. These are
  // what stop the same charge being billed twice, so they have to survive the
  // round trip out to the client and back.
  sourceType: z.enum(INVOICE_ITEM_SOURCES).optional().nullable(),
  sourceId: objectId('sourceId').optional().nullable(),
  sourceKey: z.string().trim().max(120).optional(),

  // GST. All optional — omitted fields are filled in from the line's category
  // (see config/gst.js), so an ordinary bill needs no tax data entry, and a
  // line that genuinely differs from its category's default can still say so.
  hsnSac: z.string().trim().max(10).optional(),
  taxTreatment: z.enum(TAX_TREATMENTS).optional(),
  taxRatePercent: z.coerce.number().refine((v) => GST_RATES.includes(v), {
    message: `GST rate must be one of ${GST_RATES.join(', ')}%`,
  }).optional(),
});

export const createInvoiceSchema = z.object({
  patient: objectId('patient'),
  items: z.array(itemSchema).min(1, 'Add at least one line item'),
  discount: zodPaise(z.coerce.number().min(0)).optional(),
  taxPercent: z.coerce.number().min(0).max(100).optional(),
  // Only set when the bill is raised to a company or TPA rather than to an
  // individual, which is what makes it a B2B invoice and can put the supply in
  // another state. Blank on an ordinary patient bill.
  customerGstin: z.union([z.literal(''), z.string().trim().toUpperCase().regex(GSTIN_PATTERN, 'Not a valid GSTIN')]).optional(),
  placeOfSupply: z.union([z.literal(''), z.string().trim().regex(/^\d{2}$/, 'Place of supply is a two-digit state code')]).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const updateInvoiceSchema = z.object({
  items: z.array(itemSchema).min(1).optional(),
  discount: zodPaise(z.coerce.number().min(0)).optional(),
  taxPercent: z.coerce.number().min(0).max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const recordPaymentSchema = z.object({
  amount: zodPaise(z.coerce.number().positive('Amount must be greater than zero')),
  method: z.enum(PAYMENT_METHODS).optional(),
  transactionId: z.string().trim().max(80).optional(),
  note: z.string().trim().max(300).optional(),
});

export const refundInvoiceSchema = z.object({
  amount: zodPaise(z.coerce.number().positive('Refund amount must be greater than zero')),
  method: z.enum(PAYMENT_METHODS).optional(),
  reason: z.string().trim().max(300).optional(),
});

export const cancelInvoiceSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

export const listInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().default(''),
  status: z.enum(['PENDING', 'PARTIAL', 'PAID', 'REFUNDED', 'CANCELLED', 'ALL']).optional().default('ALL'),
  patient: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
});
