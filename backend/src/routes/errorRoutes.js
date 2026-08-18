import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as c from '../controllers/errorController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// --- Ingestion --------------------------------------------------------------
//
// Unauthenticated on purpose. A crash on the login screen, or one that happens
// precisely because the session broke, is exactly the report worth having — and
// requiring a token would drop all of them.
//
// What makes that safe is the budget below rather than a session: one browser
// cannot post more than 30 reports in five minutes. A render loop that throws
// on every frame would otherwise turn one broken page into a denial of service
// against the hospital's own database. Reports beyond the budget are dropped,
// which costs nothing — they are all the same error anyway, and it is already
// recorded.
router.post(
  '/report',
  rateLimit({
    windowMs: 5 * 60 * 1000,
    max: Number(process.env.ERROR_REPORT_RATE_LIMIT) || 30,
    standardHeaders: true,
    legacyHeaders: false,
    // A 429 here must not itself become an error the client reports, so it
    // answers 202 like the real thing and quietly discards.
    handler: (_req, res) => res.status(202).json({ success: true, message: 'Reported', data: null }),
    skip: () => process.env.NODE_ENV === 'test',
  }),
  validate(c.reportSchema),
  c.report
);

// --- Triage -----------------------------------------------------------------
//
// Everything below reads stack traces and request context from a live hospital,
// so it sits behind the same gate as the rest of the operations console.
router.use(authenticate, requirePermission('errors:view'));

router.get('/', c.list);
router.get('/stats', c.stats);
router.get('/export', c.exportErrors);
router.get('/:id', c.detail);

router.patch('/:id/resolve', requirePermission('errors:manage'), c.setResolved);
router.delete('/:id', requirePermission('errors:manage'), c.remove);

export default router;
