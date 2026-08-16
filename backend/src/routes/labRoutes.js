import { Router } from 'express';
import * as c from '../controllers/labController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/roles.js';
import {
  createLabTestSchema, updateLabTestSchema, listLabTestsQuerySchema,
  createLabOrderSchema, enterResultsSchema, labStatusSchema, listLabQuerySchema, exportLabQuerySchema,
} from '../validators/labValidator.js';

const router = Router();
router.use(authenticate);

const CAN_VIEW = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.NURSE, ROLES.LAB_TECHNICIAN, ROLES.RECEPTIONIST];
const CAN_ORDER = [ROLES.ADMIN, ROLES.DOCTOR];
const CAN_PROCESS = [ROLES.ADMIN, ROLES.LAB_TECHNICIAN];
const CAN_VERIFY = [ROLES.ADMIN, ROLES.DOCTOR];

// --- Test master (ADMIN) ---
router.get('/tests', validate(listLabTestsQuerySchema, 'query'), c.listTests);
router.get('/tests/active', c.activeTests);
router.post('/tests', authorize(ROLES.ADMIN), validate(createLabTestSchema), c.createTest);
router.put('/tests/:id', authorize(ROLES.ADMIN), validate(updateLabTestSchema), c.updateTest);
router.delete('/tests/:id', authorize(ROLES.ADMIN), c.deleteTest);

// --- Orders ---
router.get('/orders', authorize(...CAN_VIEW), validate(listLabQuerySchema, 'query'), c.listOrders);
router.get('/orders/stats', authorize(...CAN_VIEW), c.stats);
router.get('/orders/export', authorize(...CAN_VIEW), validate(exportLabQuerySchema, 'query'), c.exportOrders);
router.get('/orders/:id', authorize(...CAN_VIEW), c.getOrder);
router.get('/orders/:id/pdf', authorize(...CAN_VIEW), c.orderPdf);
router.post('/orders', authorize(...CAN_ORDER), validate(createLabOrderSchema), c.createOrder);
router.put('/orders/:id/results', authorize(...CAN_PROCESS), validate(enterResultsSchema), c.enterResults);
// Status: collection/processing done by lab tech; verification by doctor; cancel by either.
router.patch('/orders/:id/status', authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.LAB_TECHNICIAN), validate(labStatusSchema), c.changeStatus);

export default router;
