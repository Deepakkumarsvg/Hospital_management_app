import { Router } from 'express';
import * as c from '../controllers/pharmacyController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { validate } from '../middleware/validate.js';
import {
  createMedicineSchema, updateMedicineSchema, receiveBatchSchema, dispenseSchema, adjustStockSchema,
  listMedicinesQuerySchema, exportMedicinesQuerySchema, listDispensesQuerySchema, exportDispensesQuerySchema,
  expiringQuerySchema,
} from '../validators/pharmacyValidator.js';

const router = Router();
router.use(authenticate, auditTrail('Pharmacy', { phi: true }));


router.get('/medicines', requirePermission('pharmacy:view'), validate(listMedicinesQuerySchema, 'query'), c.listMedicines);
router.get('/medicines/active', requirePermission('pharmacy:view'), c.activeMedicines);
router.get('/medicines/export', requirePermission('pharmacy:view'), validate(exportMedicinesQuerySchema, 'query'), c.exportMedicines);
router.get('/stats', requirePermission('pharmacy:view'), c.stats);
router.get('/expiring', requirePermission('pharmacy:view'), validate(expiringQuerySchema, 'query'), c.expiring);
router.get('/dispenses', requirePermission('pharmacy:view'), validate(listDispensesQuerySchema, 'query'), c.listDispenses);
router.get('/dispenses/export', requirePermission('pharmacy:view'), validate(exportDispensesQuerySchema, 'query'), c.exportDispenses);
router.get('/dispenses/:id', requirePermission('pharmacy:view'), c.getDispense);
router.get('/dispenses/:id/pdf', requirePermission('pharmacy:view'), c.dispenseReceiptPdf);
router.post('/dispenses/:id/return', requirePermission('pharmacy:manage'), c.returnDispense);
router.get('/medicines/:id', requirePermission('pharmacy:view'), c.getMedicine);

router.post('/medicines', requirePermission('pharmacy:manage'), validate(createMedicineSchema), c.createMedicine);
router.put('/medicines/:id', requirePermission('pharmacy:manage'), validate(updateMedicineSchema), c.updateMedicine);
router.delete('/medicines/:id', requirePermission('pharmacy:delete'), c.deleteMedicine);

router.post('/medicines/:id/batches', requirePermission('pharmacy:manage'), validate(receiveBatchSchema), c.receiveBatch);
router.post('/medicines/:id/adjust', requirePermission('pharmacy:manage'), validate(adjustStockSchema), c.adjustStock);
router.post('/dispense', requirePermission('pharmacy:manage'), validate(dispenseSchema), c.dispense);

export default router;
