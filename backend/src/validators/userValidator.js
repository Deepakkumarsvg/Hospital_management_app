import { z } from 'zod';
import { ROLE_LIST } from '../config/roles.js';
// Admin-created accounts must clear the same bar as self-service ones —
// otherwise the strong policy is trivially bypassed from the Users screen.
import { passwordPolicy } from './authValidator.js';

const phoneRegex = /^[0-9+\-\s()]{7,15}$/;

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(100),
  email: z.string().trim().email('Valid email is required').toLowerCase(),
  phone: z.string().trim().regex(phoneRegex, 'Invalid phone').or(z.literal('')).optional(),
  password: passwordPolicy,
  role: z.enum(ROLE_LIST, { errorMap: () => ({ message: 'Valid role is required' }) }),
  department: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid department').optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().regex(phoneRegex).or(z.literal('')).optional(),
  password: passwordPolicy.optional(), // optional — only when changing
  role: z.enum(ROLE_LIST).optional(),
  department: z.string().regex(/^[0-9a-fA-F]{24}$/).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().default(''),
  role: z.enum([...ROLE_LIST, 'ALL']).optional().default('ALL'),
});
