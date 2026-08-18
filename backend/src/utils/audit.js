import { AuditLog } from '../models/AuditLog.js';

// Set on the request once something has written a descriptive entry for it, so
// the automatic router-level trail (middleware/auditTrail.js) doesn't add a
// second, vaguer one for the same action.
const FLAG = Symbol('audited');

export const markAudited = (req) => { if (req) req[FLAG] = true; };
export const wasAudited = (req) => !!req?.[FLAG];

// Fire-and-forget audit writer. Never blocks or throws into the request flow.
export function audit(req, { action, module, recordId = '', description = '', meta = null }) {
  try {
    markAudited(req);

    const user = req?.user;
    AuditLog.create({
      user: user?._id || null,
      userName: user?.name || '',
      userRole: user?.role || '',
      action,
      module,
      recordId: String(recordId || ''),
      description,
      // req.ip is trustworthy here because app.js sets a hop count on
      // `trust proxy` rather than trusting the whole X-Forwarded-For chain.
      ip: req?.ip || '',
      // Ties the entry back to the request log line for the same action.
      requestId: req?.id || req?.headers?.['x-request-id'] || '',
      meta,
    }).catch(() => {});
  } catch {
    // swallow — auditing must never break the primary action
  }
}
