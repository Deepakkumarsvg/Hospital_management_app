import { Router } from 'express';
import * as c from '../controllers/billingController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/roles.js';
import {
  createInvoiceSchema, updateInvoiceSchema, recordPaymentSchema, listInvoicesQuerySchema,
  refundInvoiceSchema, cancelInvoiceSchema,
} from '../validators/billingValidator.js';

const router = Router();
router.use(authenticate);

const CAN_VIEW = [ROLES.ADMIN, ROLES.ACCOUNTANT, ROLES.RECEPTIONIST];
const CAN_MANAGE = [ROLES.ADMIN, ROLES.ACCOUNTANT, ROLES.RECEPTIONIST];
// Cancelling or refunding reverses money that's already been billed/collected
// — kept to finance roles only, unlike day-to-day invoice/payment entry.
const CAN_REVERSE = [ROLES.ADMIN, ROLES.ACCOUNTANT];

router.get('/invoices', authorize(...CAN_VIEW), validate(listInvoicesQuerySchema, 'query'), c.list);
router.get('/stats', authorize(...CAN_VIEW), c.stats);
router.get('/suggestions/:patientId', authorize(...CAN_VIEW), c.suggestions);
router.get('/invoices/:id', authorize(...CAN_VIEW), c.get);
router.get('/invoices/:id/pdf', authorize(...CAN_VIEW), c.pdf);

router.post('/invoices', authorize(...CAN_MANAGE), validate(createInvoiceSchema), c.create);
router.put('/invoices/:id', authorize(...CAN_MANAGE), validate(updateInvoiceSchema), c.update);
router.post('/invoices/:id/payments', authorize(...CAN_MANAGE), validate(recordPaymentSchema), c.pay);
router.patch('/invoices/:id/cancel', authorize(...CAN_REVERSE), validate(cancelInvoiceSchema), c.cancel);
router.post('/invoices/:id/refund', authorize(...CAN_REVERSE), validate(refundInvoiceSchema), c.refund);

export default router;
