import { Router } from 'express';
import * as controller from '../controllers/opdController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { validate } from '../middleware/validate.js';
import {
  createOpdVisitSchema,
  updateOpdVisitSchema,
  listOpdQuerySchema,
  exportOpdQuerySchema,
} from '../validators/opdValidator.js';

const router = Router();
router.use(authenticate, auditTrail('OPDVisit', { phi: true }));

// Nurses record vitals; doctors run the consultation. Both can create/update.

router.post('/allergy-check', requirePermission('opd:edit'), controller.allergyCheck);
router.get('/', requirePermission('opd:view'), validate(listOpdQuerySchema, 'query'), controller.list);
router.get('/stats', requirePermission('opd:view'), controller.stats);
router.get('/export', requirePermission('opd:view'), validate(exportOpdQuerySchema, 'query'), controller.exportVisits);
router.get('/:id', requirePermission('opd:view'), controller.get);
router.get('/:id/pdf', requirePermission('opd:view'), controller.prescriptionPdf);

router.post('/', requirePermission('opd:edit'), validate(createOpdVisitSchema), controller.create);
router.put('/:id', requirePermission('opd:edit'), validate(updateOpdVisitSchema), controller.update);
router.delete('/:id', requirePermission('opd:delete'), controller.remove);

export default router;
