import { z } from 'zod';
import { TARIFF_SERVICE_TYPES } from '../models/TariffPlan.js';
import { zodPaise } from '../utils/money.js';

const objectId = (label) => z.string().regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

export const createPlanSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  code: z.string().trim().min(2, 'Code is required').max(30).toUpperCase(),
  description: z.string().trim().max(500).optional(),
  isDefault: z.boolean().optional(),
  // Signed: -10 is "our list, minus 10%", which is how most contracts read.
  baseAdjustmentPercent: z.coerce.number().min(-100).max(100).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const updatePlanSchema = createPlanSchema.partial();

// price: null REMOVES the override. "This plan does not price this specially"
// and "this plan prices this at zero" are different statements — see setRate().
export const setRateSchema = z.object({
  serviceType: z.enum(TARIFF_SERVICE_TYPES),
  service: objectId('service'),
  price: zodPaise(z.coerce.number().min(0)).nullable().optional(),
});

export const setRatesBulkSchema = z.object({
  serviceType: z.enum(TARIFF_SERVICE_TYPES),
  rates: z.array(z.object({
    service: objectId('service'),
    price: zodPaise(z.coerce.number().min(0)),
  })).min(1, 'Add at least one rate').max(1000),
});

export const listPlansQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).optional().default('ALL'),
});
