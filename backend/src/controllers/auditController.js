import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import { AuditLog } from '../models/AuditLog.js';
import { sendCsv, sendExcel } from '../utils/exporters.js';

// Shared filter builder for both list and export.
function buildFilter(query) {
  const filter = {};
  if (query.module && query.module !== 'ALL') filter.module = query.module;
  if (query.action && query.action !== 'ALL') filter.action = query.action;
  if (query.search) {
    const rx = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ description: rx }, { userName: rx }, { recordId: rx }];
  }
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) { const d = new Date(query.from); d.setHours(0, 0, 0, 0); filter.createdAt.$gte = d; }
    if (query.to) { const d = new Date(query.to); d.setHours(23, 59, 59, 999); filter.createdAt.$lte = d; }
  }
  return filter;
}

// GET /api/audit-logs?page&limit&module&action&search&from&to
export const list = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
  const filter = buildFilter(req.query);
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

// GET /api/audit-logs/facets — distinct module/action values actually in
// use, so the filter dropdowns never drift from what's really being logged.
export const facets = asyncHandler(async (_req, res) => {
  const [modules, actions] = await Promise.all([
    AuditLog.distinct('module'),
    AuditLog.distinct('action'),
  ]);
  sendSuccess(res, { message: 'Audit log facets', data: { modules: modules.sort(), actions: actions.sort() } });
});

// GET /api/audit-logs/export?format=csv|xlsx&module=&action=&search=&from=&to=
export const exportLogs = asyncHandler(async (req, res) => {
  const filter = buildFilter(req.query);
  const items = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(20000).lean();
  const rows = items.map((l) => ({
    Time: new Date(l.createdAt).toISOString(),
    User: l.userName, Action: l.action, Module: l.module,
    'Record ID': l.recordId, Description: l.description, IP: l.ip,
  }));
  const name = `audit-logs-${new Date().toISOString().slice(0, 10)}`;
  if (req.query.format === 'xlsx') return sendExcel(res, name, rows, 'Audit Logs');
  return sendCsv(res, name, rows);
});
