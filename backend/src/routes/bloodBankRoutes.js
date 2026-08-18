import { Router } from 'express';
import * as c from '../controllers/bloodBankController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { validate } from '../middleware/validate.js';
import {
  createDonorSchema, updateDonorSchema, collectUnitSchema, issueUnitSchema, reserveUnitSchema, listUnitsQuerySchema,
} from '../validators/bloodBankValidator.js';

const router = Router();
router.use(authenticate, auditTrail('BloodBank', { phi: true }));

// Lab technicians run the blood bank; doctors/nurses can view stock.

router.get('/donors', requirePermission('bloodbank:view'), c.listDonors);
router.post('/donors', requirePermission('bloodbank:manage'), validate(createDonorSchema), c.createDonor);
router.put('/donors/:id', requirePermission('bloodbank:manage'), validate(updateDonorSchema), c.updateDonor);
router.delete('/donors/:id', requirePermission('bloodbank:delete'), c.deleteDonor);

router.get('/units', requirePermission('bloodbank:view'), validate(listUnitsQuerySchema, 'query'), c.listUnits);
router.get('/units/:id', requirePermission('bloodbank:view'), c.getUnit);
router.get('/stock', requirePermission('bloodbank:view'), c.stock);
router.post('/units', requirePermission('bloodbank:manage'), validate(collectUnitSchema), c.collectUnit);
router.patch('/units/:id/issue', requirePermission('bloodbank:manage'), validate(issueUnitSchema), c.issueUnit);
router.patch('/units/:id/reserve', requirePermission('bloodbank:manage'), validate(reserveUnitSchema), c.reserveUnit);
router.patch('/units/:id/unreserve', requirePermission('bloodbank:manage'), c.unreserveUnit);
router.patch('/units/:id/discard', requirePermission('bloodbank:manage'), c.discardUnit);

export default router;
