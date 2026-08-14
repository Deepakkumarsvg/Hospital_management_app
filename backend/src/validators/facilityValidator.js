import { z } from 'zod';
import { WARD_TYPES } from '../models/Ward.js';
import { BED_STATUSES } from '../models/Bed.js';

const objectId = (label) => z.string().regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

// --- Ward ---
export const createWardSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80),
  code: z.string().trim().min(2, 'Code is required').max(12).toUpperCase(),
  type: z.enum(WARD_TYPES).optional(),
  department: objectId('department').optional().nullable(),
  floor: z.string().trim().max(20).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export const updateWardSchema = createWardSchema.partial();

// --- Room ---
export const createRoomSchema = z.object({
  ward: objectId('ward'),
  roomNo: z.string().trim().min(1, 'Room number is required').max(20),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export const updateRoomSchema = z.object({
  roomNo: z.string().trim().min(1).max(20).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

// --- Bed ---
export const createBedSchema = z.object({
  room: objectId('room'),
  bedNo: z.string().trim().min(1, 'Bed number is required').max(20),
  dailyCharge: z.coerce.number().min(0).optional(),
  status: z.enum(BED_STATUSES).optional(),
});
export const updateBedSchema = z.object({
  bedNo: z.string().trim().min(1).max(20).optional(),
  dailyCharge: z.coerce.number().min(0).optional(),
  // Manual status change is limited to non-occupancy states; OCCUPIED is driven by IPD.
  status: z.enum(['AVAILABLE', 'RESERVED', 'MAINTENANCE']).optional(),
});
