import { Router } from 'express';
import * as c from '../controllers/pharmacyController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/roles.js';
import {
  createMedicineSchema, updateMedicineSchema, receiveBatchSchema, dispenseSchema, adjustStockSchema,
  listMedicinesQuerySchema, exportMedicinesQuerySchema, listDispensesQuerySchema, exportDispensesQuerySchema,
  expiringQuerySchema,
} from '../validators/pharmacyValidator.js';

const router = Router();
router.use(authenticate);

const CAN_VIEW = [ROLES.ADMIN, ROLES.PHARMACIST, ROLES.DOCTOR, ROLES.NURSE];
const CAN_MANAGE = [ROLES.ADMIN, ROLES.PHARMACIST]; // master + stock + dispense

router.get('/medicines', authorize(...CAN_VIEW), validate(listMedicinesQuerySchema, 'query'), c.listMedicines);
router.get('/medicines/active', authorize(...CAN_VIEW), c.activeMedicines);
router.get('/medicines/export', authorize(...CAN_VIEW), validate(exportMedicinesQuerySchema, 'query'), c.exportMedicines);
router.get('/stats', authorize(...CAN_VIEW), c.stats);
router.get('/expiring', authorize(...CAN_VIEW), validate(expiringQuerySchema, 'query'), c.expiring);
router.get('/dispenses', authorize(...CAN_VIEW), validate(listDispensesQuerySchema, 'query'), c.listDispenses);
router.get('/dispenses/export', authorize(...CAN_VIEW), validate(exportDispensesQuerySchema, 'query'), c.exportDispenses);
router.get('/dispenses/:id', authorize(...CAN_VIEW), c.getDispense);
router.get('/dispenses/:id/pdf', authorize(...CAN_VIEW), c.dispenseReceiptPdf);
router.post('/dispenses/:id/return', authorize(...CAN_MANAGE), c.returnDispense);
router.get('/medicines/:id', authorize(...CAN_VIEW), c.getMedicine);

router.post('/medicines', authorize(...CAN_MANAGE), validate(createMedicineSchema), c.createMedicine);
router.put('/medicines/:id', authorize(...CAN_MANAGE), validate(updateMedicineSchema), c.updateMedicine);
router.delete('/medicines/:id', authorize(ROLES.ADMIN), c.deleteMedicine);

router.post('/medicines/:id/batches', authorize(...CAN_MANAGE), validate(receiveBatchSchema), c.receiveBatch);
router.post('/medicines/:id/adjust', authorize(...CAN_MANAGE), validate(adjustStockSchema), c.adjustStock);
router.post('/dispense', authorize(...CAN_MANAGE), validate(dispenseSchema), c.dispense);

export default router;
