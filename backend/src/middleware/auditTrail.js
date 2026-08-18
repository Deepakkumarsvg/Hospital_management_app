// Automatic audit trail.
//
// Auditing used to be a call each controller had to remember to make, and
// roughly half of them didn't — so half the system's writes left no trace, and
// nothing recorded who had *read* a patient's record at all. "Who looked at
// this chart" is exactly the question an audit trail exists to answer, and it
// is a hard requirement under NABH/HIPAA/DISHA.
//
// Making it a router-level middleware inverts the default: a new endpoint is
// audited because it exists, not because somebody remembered. Controllers can
// still call audit() directly to add a richer description — when they do, this
// steps aside rather than writing a second, vaguer entry.
import { audit, markAudited, wasAudited } from '../utils/audit.js';

const MUTATIONS = { POST: 'CREATE', PUT: 'UPDATE', PATCH: 'UPDATE', DELETE: 'DELETE' };

// Anything that could carry a credential or a payload we must never persist.
const REDACT = new Set([
  'password', 'currentPassword', 'newPassword', 'confirmPassword',
  'token', 'refreshToken', 'signature', 'passwordHash',
]);

// A compact, safe summary of what was sent. The audit log is not a place to
// mirror request bodies wholesale: it would duplicate the clinical record and,
// worse, capture secrets.
function safeMeta(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const keys = Object.keys(body).filter((k) => !REDACT.has(k));
  const meta = {};
  for (const k of keys.slice(0, 12)) {
    const v = body[k];
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') {
      meta[k] = Array.isArray(v) ? `[${v.length} item(s)]` : '{…}';
    } else {
      meta[k] = String(v).slice(0, 120);
    }
  }
  return Object.keys(meta).length ? meta : null;
}

/**
 * Audit every request through a router.
 *
 * @param module  the module name recorded on the entry (e.g. 'Patient')
 * @param phi     when true, successful GETs are recorded too, because reading
 *                this data is itself an event worth being able to account for
 */
export function auditTrail(module, { phi = false } = {}) {
  return (req, res, next) => {
    // Log after the handler has run, so the recorded outcome is the real one —
    // a request that was rejected must not appear as a completed action.
    res.on('finish', () => {
      try {
        if (res.statusCode >= 400) return;
        // A controller that described the action itself has already said it
        // better than this could.
        if (wasAudited(req)) return;

        const isMutation = !!MUTATIONS[req.method];
        if (!isMutation && !(phi && req.method === 'GET')) return;

        const action = isMutation ? MUTATIONS[req.method] : 'READ';
        const recordId = req.params?.id || req.params?.patientId || '';

        audit(req, {
          action,
          module,
          recordId,
          description: `${action} ${module}${recordId ? ` ${recordId}` : ''} · ${req.method} ${req.originalUrl.split('?')[0]}`,
          meta: isMutation ? safeMeta(req) : null,
        });
      } catch {
        // Auditing must never affect the response — it has already been sent.
      }
    });
    next();
  };
}

export { markAudited };
