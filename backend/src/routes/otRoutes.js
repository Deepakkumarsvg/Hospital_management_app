import { Router } from 'express';
import * as c from '../controllers/otController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { validate } from '../middleware/validate.js';
import {
  createTheatreSchema, updateTheatreSchema,
  createSurgerySchema, updateSurgerySchema, surgeryStatusSchema, listSurgeryQuerySchema,
} from '../validators/otValidator.js';

const router = Router();
router.use(authenticate, auditTrail('Surgery', { phi: true }));


router.get('/theatres', requirePermission('ot:view'), c.listTheatres);
router.get('/theatres/active', requirePermission('ot:view'), c.activeTheatres);
router.post('/theatres', requirePermission('ot:admin'), validate(createTheatreSchema), c.createTheatre);
router.put('/theatres/:id', requirePermission('ot:admin'), validate(updateTheatreSchema), c.updateTheatre);
router.delete('/theatres/:id', requirePermission('ot:admin'), c.deleteTheatre);

router.get('/surgeries', requirePermission('ot:view'), validate(listSurgeryQuerySchema, 'query'), c.listSurgeries);
router.get('/stats', requirePermission('ot:view'), c.stats);
router.get('/surgeries/:id', requirePermission('ot:view'), c.getSurgery);
router.post('/surgeries', requirePermission('ot:manage'), validate(createSurgerySchema), c.createSurgery);
router.put('/surgeries/:id', requirePermission('ot:manage'), validate(updateSurgerySchema), c.updateSurgery);
router.patch('/surgeries/:id/status', requirePermission('ot:manage'), validate(surgeryStatusSchema), c.changeStatus);

export default router;
