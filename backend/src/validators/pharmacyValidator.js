import { z } from 'zod';
import { MEDICINE_UNITS } from '../models/Medicine.js';

const objectId = (label) => z.string().regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

export const createMedicineSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  genericName: z.string().trim().max(120).optional(),
  category: z.string().trim().max(60).optional(),
  manufacturer: z.string().trim().max(120).optional(),
  unit: z.enum(MEDICINE_UNITS).optional(),
  mrp: z.coerce.number().min(0).optional(),
  purchasePrice: z.coerce.number().min(0).optional(),
  sellingPrice: z.coerce.number().min(0).optional(),
  minStock: z.coerce.number().min(0).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export const updateMedicineSchema = createMedicineSchema.partial();

export const receiveBatchSchema = z.object({
  batchNo: z.string().trim().min(1, 'Batch number is required').max(40),
  expiryDate: z.coerce.date({ errorMap: () => ({ message: 'Valid expiry date is required' }) }),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  purchasePrice: z.coerce.number().min(0).optional(),
  mrp: z.coerce.number().min(0).optional(),
});

export const dispenseSchema = z.object({
  patient: objectId('patient').optional().nullable(),
  opdVisit: objectId('opdVisit').optional().nullable(),
  items: z.array(z.object({
    medicine: objectId('medicine'),
    quantity: z.coerce.number().int().min(1),
  })).min(1, 'Add at least one medicine'),
});

export const listMedicinesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().default(''),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).optional().default('ALL'),
  lowStock: z.enum(['true', 'false']).optional(),
});
