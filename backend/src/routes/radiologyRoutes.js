import { Router } from 'express';
import * as c from '../controllers/radiologyController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { validate } from '../middleware/validate.js';
import {
  createRadTestSchema, updateRadTestSchema, listRadTestsQuerySchema,
  createRadOrderSchema, radReportSchema, radStatusSchema, listRadQuerySchema, exportRadQuerySchema,
} from '../validators/radiologyValidator.js';

const router = Router();
router.use(authenticate, auditTrail('RadiologyOrder', { phi: true }));


router.get('/tests', validate(listRadTestsQuerySchema, 'query'), c.listTests);
router.get('/tests/active', c.activeTests);
router.post('/tests', requirePermission('radiology:manage'), validate(createRadTestSchema), c.createTest);
router.put('/tests/:id', requirePermission('radiology:manage'), validate(updateRadTestSchema), c.updateTest);
router.delete('/tests/:id', requirePermission('radiology:manage'), c.deleteTest);

router.get('/orders', requirePermission('radiology:view'), validate(listRadQuerySchema, 'query'), c.listOrders);
router.get('/orders/stats', requirePermission('radiology:view'), c.stats);
router.get('/orders/export', requirePermission('radiology:view'), validate(exportRadQuerySchema, 'query'), c.exportOrders);
router.get('/orders/:id', requirePermission('radiology:view'), c.getOrder);
router.get('/orders/:id/pdf', requirePermission('radiology:view'), c.orderPdf);
router.post('/orders', requirePermission('radiology:order'), validate(createRadOrderSchema), c.createOrder);
router.patch('/orders/:id/status', requirePermission('radiology:order', 'radiology:process'), validate(radStatusSchema), c.changeStatus);
router.put('/orders/:id/report', requirePermission('radiology:process'), validate(radReportSchema), c.submitReport);

export default router;
