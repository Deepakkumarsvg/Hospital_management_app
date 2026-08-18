import { Router } from 'express';
import * as c from '../controllers/emergencyController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { validate } from '../middleware/validate.js';
import {
  registerArrivalSchema, triageSchema, startTreatmentSchema, updateVisitSchema,
  identifySchema, mlcSchema, disposeSchema, listQuerySchema, statsQuerySchema,
} from '../validators/emergencyValidator.js';

const router = Router();
router.use(authenticate, auditTrail('EmergencyVisit', { phi: true }));

router.get('/triage-scale', requirePermission('emergency:view'), c.triageScale);
router.get('/queue', requirePermission('emergency:view'), c.queue);
router.get('/stats', requirePermission('emergency:view'), validate(statsQuerySchema, 'query'), c.stats);
router.get('/', requirePermission('emergency:view'), validate(listQuerySchema, 'query'), c.list);
// The MLC register is a statutory document — reading it is a separate,
// narrower right than seeing the casualty board.
router.get('/mlc/export', requirePermission('emergency:mlc'), c.exportMlcRegister);
router.get('/:id', requirePermission('emergency:view'), c.get);

// Registering an arrival is reception's job, and triage is the nurse's — two
// different permissions because in a real department they are two different
// people, and the second is a clinical judgement.
router.post('/', requirePermission('emergency:register'), validate(registerArrivalSchema), c.register);
router.patch('/:id/triage', requirePermission('emergency:triage'), validate(triageSchema), c.triage);
router.patch('/:id/identify', requirePermission('emergency:register'), validate(identifySchema), c.identify);

router.patch('/:id/start', requirePermission('emergency:treat'), validate(startTreatmentSchema), c.startTreatment);
router.put('/:id', requirePermission('emergency:treat'), validate(updateVisitSchema), c.update);
router.patch('/:id/observe', requirePermission('emergency:treat'), c.observe);
router.patch('/:id/dispose', requirePermission('emergency:treat'), validate(disposeSchema), c.dispose);

router.patch('/:id/mlc', requirePermission('emergency:mlc'), validate(mlcSchema), c.flagMLC);

export default router;
