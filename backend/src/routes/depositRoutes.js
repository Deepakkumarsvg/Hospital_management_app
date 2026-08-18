import { Router } from 'express';
import * as c from '../controllers/depositController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { validate } from '../middleware/validate.js';
import {
  collectSchema, topUpSchema, applySchema, refundSchema, listQuerySchema,
} from '../validators/depositValidator.js';

const router = Router();
router.use(authenticate, auditTrail('Deposit', { phi: true }));

router.get('/', requirePermission('deposits:view'), validate(listQuerySchema, 'query'), c.list);
router.get('/balance/:patientId', requirePermission('deposits:view'), c.balance);
router.get('/:id', requirePermission('deposits:view'), c.get);

router.post('/', requirePermission('deposits:manage'), validate(collectSchema), c.collect);
router.post('/:id/top-up', requirePermission('deposits:manage'), validate(topUpSchema), c.topUp);
router.post('/:id/apply', requirePermission('deposits:manage'), validate(applySchema), c.apply);

// Handing money back is the reverse of taking it, and belongs with whoever is
// trusted to reverse a payment — not with everyone who can take one.
router.post('/:id/refund', requirePermission('deposits:refund'), validate(refundSchema), c.refund);
router.patch('/:id/close', requirePermission('deposits:refund'), c.close);

export default router;
