import { Router } from 'express';
import * as c from '../controllers/radiologyController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/roles.js';
import {
  createRadTestSchema, updateRadTestSchema, listRadTestsQuerySchema,
  createRadOrderSchema, radReportSchema, radStatusSchema, listRadQuerySchema, exportRadQuerySchema,
} from '../validators/radiologyValidator.js';

const router = Router();
router.use(authenticate);

const CAN_VIEW = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.RADIOLOGIST, ROLES.NURSE, ROLES.RECEPTIONIST];
const CAN_ORDER = [ROLES.ADMIN, ROLES.DOCTOR];
const CAN_PROCESS = [ROLES.ADMIN, ROLES.RADIOLOGIST];

router.get('/tests', validate(listRadTestsQuerySchema, 'query'), c.listTests);
router.get('/tests/active', c.activeTests);
router.post('/tests', authorize(ROLES.ADMIN), validate(createRadTestSchema), c.createTest);
router.put('/tests/:id', authorize(ROLES.ADMIN), validate(updateRadTestSchema), c.updateTest);
router.delete('/tests/:id', authorize(ROLES.ADMIN), c.deleteTest);

router.get('/orders', authorize(...CAN_VIEW), validate(listRadQuerySchema, 'query'), c.listOrders);
router.get('/orders/stats', authorize(...CAN_VIEW), c.stats);
router.get('/orders/export', authorize(...CAN_VIEW), validate(exportRadQuerySchema, 'query'), c.exportOrders);
router.get('/orders/:id', authorize(...CAN_VIEW), c.getOrder);
router.get('/orders/:id/pdf', authorize(...CAN_VIEW), c.orderPdf);
router.post('/orders', authorize(...CAN_ORDER), validate(createRadOrderSchema), c.createOrder);
router.patch('/orders/:id/status', authorize(ROLES.ADMIN, ROLES.RADIOLOGIST, ROLES.DOCTOR), validate(radStatusSchema), c.changeStatus);
router.put('/orders/:id/report', authorize(...CAN_PROCESS), validate(radReportSchema), c.submitReport);

export default router;
