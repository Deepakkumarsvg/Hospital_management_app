import { AuditLog } from '../models/AuditLog.js';

// Fire-and-forget audit writer. Never blocks or throws into the request flow.
export function audit(req, { action, module, recordId = '', description = '', meta = null }) {
  try {
    const user = req?.user;
    AuditLog.create({
      user: user?._id || null,
      userName: user?.name || '',
      action,
      module,
      recordId: String(recordId || ''),
      description,
      ip: req?.ip || req?.headers?.['x-forwarded-for'] || '',
      meta,
    }).catch(() => {});
  } catch {
    // swallow — auditing must never break the primary action
  }
}
