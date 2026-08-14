import { Router } from 'express';
import * as c from '../controllers/bloodBankController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/roles.js';
import {
  createDonorSchema, updateDonorSchema, collectUnitSchema, issueUnitSchema, listUnitsQuerySchema,
} from '../validators/bloodBankValidator.js';

const router = Router();
router.use(authenticate);

// Lab technicians run the blood bank; doctors/nurses can view stock.
const CAN_VIEW = [ROLES.ADMIN, ROLES.LAB_TECHNICIAN, ROLES.DOCTOR, ROLES.NURSE];
const CAN_MANAGE = [ROLES.ADMIN, ROLES.LAB_TECHNICIAN];

router.get('/donors', authorize(...CAN_VIEW), c.listDonors);
router.post('/donors', authorize(...CAN_MANAGE), validate(createDonorSchema), c.createDonor);
router.put('/donors/:id', authorize(...CAN_MANAGE), validate(updateDonorSchema), c.updateDonor);
router.delete('/donors/:id', authorize(ROLES.ADMIN), c.deleteDonor);

router.get('/units', authorize(...CAN_VIEW), validate(listUnitsQuerySchema, 'query'), c.listUnits);
router.get('/stock', authorize(...CAN_VIEW), c.stock);
router.post('/units', authorize(...CAN_MANAGE), validate(collectUnitSchema), c.collectUnit);
router.patch('/units/:id/issue', authorize(...CAN_MANAGE), validate(issueUnitSchema), c.issueUnit);
router.patch('/units/:id/discard', authorize(...CAN_MANAGE), c.discardUnit);

export default router;
