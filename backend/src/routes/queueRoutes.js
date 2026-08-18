import { Router } from 'express';
import * as c from '../controllers/queueController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { validate } from '../middleware/validate.js';
import {
  issueTokenSchema, startConsultationSchema, skipTokenSchema, queueQuerySchema,
} from '../validators/queueValidator.js';

const router = Router();
router.use(authenticate, auditTrail('OpdToken'));

router.get('/priorities', requirePermission('queue:view'), c.priorities);
router.get('/board', requirePermission('queue:view'), validate(queueQuerySchema, 'query'), c.board);
router.get('/stats', requirePermission('queue:view'), validate(queueQuerySchema, 'query'), c.stats);
router.get('/doctor/:doctorId', requirePermission('queue:view'), validate(queueQuerySchema, 'query'), c.doctorQueue);

// Issuing is the front-desk job.
router.post('/', requirePermission('queue:issue'), validate(issueTokenSchema), c.issue);

// Calling and running the queue belongs to whoever is working the room —
// a separate permission from issuing, because in a real OPD they are a
// separate person at a separate desk.
router.post('/doctor/:doctorId/next', requirePermission('queue:call'), c.callNext);
router.patch('/:id/call', requirePermission('queue:call'), c.callToken);
router.patch('/:id/start', requirePermission('queue:call'), validate(startConsultationSchema), c.start);
router.patch('/:id/complete', requirePermission('queue:call'), c.complete);
router.patch('/:id/skip', requirePermission('queue:call'), validate(skipTokenSchema), c.skip);

export default router;
