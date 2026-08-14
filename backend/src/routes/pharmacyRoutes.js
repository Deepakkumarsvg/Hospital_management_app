import { Router } from 'express';
import * as c from '../controllers/pharmacyController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/roles.js';
import {
  createMedicineSchema, updateMedicineSchema, receiveBatchSchema, dispenseSchema, listMedicinesQuerySchema,
} from '../validators/pharmacyValidator.js';

const router = Router();
router.use(authenticate);

const CAN_VIEW = [ROLES.ADMIN, ROLES.PHARMACIST, ROLES.DOCTOR, ROLES.NURSE];
const CAN_MANAGE = [ROLES.ADMIN, ROLES.PHARMACIST]; // master + stock + dispense

router.get('/medicines', authorize(...CAN_VIEW), validate(listMedicinesQuerySchema, 'query'), c.listMedicines);
router.get('/medicines/active', authorize(...CAN_VIEW), c.activeMedicines);
router.get('/stats', authorize(...CAN_VIEW), c.stats);
router.get('/expiring', authorize(...CAN_VIEW), c.expiring);
router.get('/dispenses', authorize(...CAN_VIEW), c.listDispenses);
router.get('/medicines/:id', authorize(...CAN_VIEW), c.getMedicine);

router.post('/medicines', authorize(...CAN_MANAGE), validate(createMedicineSchema), c.createMedicine);
router.put('/medicines/:id', authorize(...CAN_MANAGE), validate(updateMedicineSchema), c.updateMedicine);
router.delete('/medicines/:id', authorize(ROLES.ADMIN), c.deleteMedicine);

router.post('/medicines/:id/batches', authorize(...CAN_MANAGE), validate(receiveBatchSchema), c.receiveBatch);
router.post('/dispense', authorize(...CAN_MANAGE), validate(dispenseSchema), c.dispense);

export default router;
