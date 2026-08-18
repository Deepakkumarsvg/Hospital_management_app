import { z } from 'zod';
import { CLAIM_STATUSES } from '../models/InsuranceClaim.js';
import { zodPaise } from '../utils/money.js';

const objectId = (label) => z.string().regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

export const createClaimSchema = z.object({
  patient: objectId('patient'),
  invoice: objectId('invoice').optional().nullable(),
  insuranceCompany: z.string().trim().min(2, 'Insurance company is required').max(120),
  policyNumber: z.string().trim().max(80).optional(),
  preAuthNo: z.string().trim().max(80).optional(),
  claimAmount: zodPaise(z.coerce.number().positive('Claim amount must be greater than zero')),
  notes: z.string().trim().max(1000).optional(),
});

export const updateClaimSchema = z.object({
  insuranceCompany: z.string().trim().min(2).max(120).optional(),
  policyNumber: z.string().trim().max(80).optional(),
  preAuthNo: z.string().trim().max(80).optional(),
  claimAmount: zodPaise(z.coerce.number().positive()).optional(),
  notes: z.string().trim().max(1000).optional(),
});

// Approving requires an approved amount; settling optionally records a payment.
export const claimStatusSchema = z.object({
  status: z.enum(CLAIM_STATUSES),
  approvedAmount: zodPaise(z.coerce.number().min(0)).optional(),
  note: z.string().trim().max(500).optional(),
});

export const listClaimsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().default(''),
  status: z.enum([...CLAIM_STATUSES, 'ALL']).optional().default('ALL'),
  patient: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  invoice: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
});
