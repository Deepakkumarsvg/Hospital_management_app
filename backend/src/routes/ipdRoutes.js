import { Router } from 'express';
import * as controller from '../controllers/ipdController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { validate } from '../middleware/validate.js';
import {
  admitSchema, updateAdmissionSchema, nursingNoteSchema,
  transferBedSchema, dischargeSchema, listIpdQuerySchema, exportIpdQuerySchema,
} from '../validators/ipdValidator.js';

const router = Router();
router.use(authenticate, auditTrail('IPDAdmission', { phi: true }));


router.get('/', requirePermission('ipd:view'), validate(listIpdQuerySchema, 'query'), controller.list);
router.get('/stats', requirePermission('ipd:view'), controller.stats);
router.get('/export', requirePermission('ipd:view'), validate(exportIpdQuerySchema, 'query'), controller.exportAdmissions);
router.get('/:id', requirePermission('ipd:view'), controller.get);
router.get('/:id/discharge-pdf', requirePermission('ipd:view'), controller.dischargePdf);

router.post('/', requirePermission('ipd:admit'), validate(admitSchema), controller.admit);
router.put('/:id', requirePermission('ipd:admit'), validate(updateAdmissionSchema), controller.update);
router.post('/:id/notes', requirePermission('ipd:nurse'), validate(nursingNoteSchema), controller.addNote);
router.patch('/:id/transfer', requirePermission('ipd:admit'), validate(transferBedSchema), controller.transfer);
router.patch('/:id/discharge', requirePermission('ipd:admit'), validate(dischargeSchema), controller.discharge);
router.patch('/:id/cancel', requirePermission('ipd:admit'), controller.cancel);

export default router;
