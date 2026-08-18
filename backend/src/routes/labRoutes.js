import { Router } from 'express';
import * as c from '../controllers/labController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { validate } from '../middleware/validate.js';
import {
  createLabTestSchema, updateLabTestSchema, listLabTestsQuerySchema,
  createLabOrderSchema, enterResultsSchema, labStatusSchema, listLabQuerySchema, exportLabQuerySchema,
} from '../validators/labValidator.js';

const router = Router();
router.use(authenticate, auditTrail('LabOrder', { phi: true }));


// --- Test master (ADMIN) ---
router.get('/tests', validate(listLabTestsQuerySchema, 'query'), c.listTests);
router.get('/tests/active', c.activeTests);
router.post('/tests', requirePermission('laboratory:manage'), validate(createLabTestSchema), c.createTest);
router.put('/tests/:id', requirePermission('laboratory:manage'), validate(updateLabTestSchema), c.updateTest);
router.delete('/tests/:id', requirePermission('laboratory:manage'), c.deleteTest);

// --- Orders ---
router.get('/orders', requirePermission('laboratory:view'), validate(listLabQuerySchema, 'query'), c.listOrders);
router.get('/orders/stats', requirePermission('laboratory:view'), c.stats);
router.get('/orders/export', requirePermission('laboratory:view'), validate(exportLabQuerySchema, 'query'), c.exportOrders);
router.get('/orders/:id', requirePermission('laboratory:view'), c.getOrder);
router.get('/orders/:id/pdf', requirePermission('laboratory:view'), c.orderPdf);
router.post('/orders', requirePermission('laboratory:order'), validate(createLabOrderSchema), c.createOrder);
router.put('/orders/:id/results', requirePermission('laboratory:process'), validate(enterResultsSchema), c.enterResults);
// Status: collection/processing done by lab tech; verification by doctor; cancel by either.
router.patch('/orders/:id/status', requirePermission('laboratory:order', 'laboratory:process'), validate(labStatusSchema), c.changeStatus);

export default router;
