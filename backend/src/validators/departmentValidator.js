import { z } from 'zod';

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80),
  code: z.string().trim().min(2, 'Code is required').max(12).toUpperCase(),
  description: z.string().trim().max(500).optional().default(''),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const updateDepartmentSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  code: z.string().trim().min(2).max(12).toUpperCase().optional(),
  description: z.string().trim().max(500).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const listDepartmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().optional().default(''),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).optional().default('ALL'),
});

export const exportDepartmentsQuerySchema = z.object({
  search: z.string().trim().optional().default(''),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).optional().default('ALL'),
  format: z.enum(['csv', 'xlsx']).optional().default('csv'),
});
