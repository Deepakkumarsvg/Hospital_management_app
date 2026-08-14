import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import { AuditLog } from '../models/AuditLog.js';

// GET /api/audit-logs?page&limit&module&action&search
export const list = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
  const filter = {};
  if (req.query.module && req.query.module !== 'ALL') filter.module = req.query.module;
  if (req.query.action && req.query.action !== 'ALL') filter.action = req.query.action;
  if (req.query.search) {
    const rx = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ description: rx }, { userName: rx }, { recordId: rx }];
  }
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    AuditLog.countDocuments(filter),
  ]);
  sendSuccess(res, {
    message: 'Audit logs',
    data: items,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  });
});
