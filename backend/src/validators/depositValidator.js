import { z } from 'zod';
import { DEPOSIT_METHODS } from '../models/Deposit.js';
import { zodPaise } from '../utils/money.js';

const objectId = (label) => z.string().regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

// Money arrives as rupees and reaches the service as paise. See utils/money.js.
export const collectSchema = z.object({
  patient: objectId('patient'),
  admission: objectId('admission').optional().nullable(),
  amount: zodPaise(z.coerce.number().positive('An advance has to be more than zero')),
  method: z.enum(DEPOSIT_METHODS).optional(),
  reference: z.string().trim().max(80).optional(),
  note: z.string().trim().max(300).optional(),
});

export const topUpSchema = z.object({
  amount: zodPaise(z.coerce.number().positive('A top-up has to be more than zero')),
  method: z.enum(DEPOSIT_METHODS).optional(),
  reference: z.string().trim().max(80).optional(),
  note: z.string().trim().max(300).optional(),
});

export const applySchema = z.object({
  invoice: objectId('invoice'),
  // Omitted means "as much as will fit" — the smaller of what is held and
  // what is owed, which is what a cashier does anyway.
  amount: zodPaise(z.coerce.number().positive()).optional(),
});

export const refundSchema = z.object({
  // Omitted means the whole unused balance, which is the discharge case.
  amount: zodPaise(z.coerce.number().positive()).optional(),
  note: z.string().trim().max(300).optional(),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  patient: objectId('patient').optional(),
  admission: objectId('admission').optional(),
  status: z.enum(['ACTIVE', 'EXHAUSTED', 'CLOSED', 'ALL']).optional().default('ALL'),
});
