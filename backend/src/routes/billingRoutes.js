import { Router } from 'express';
import * as c from '../controllers/billingController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { validate } from '../middleware/validate.js';
import {
  createInvoiceSchema, updateInvoiceSchema, recordPaymentSchema, listInvoicesQuerySchema,
  refundInvoiceSchema, cancelInvoiceSchema,
} from '../validators/billingValidator.js';

const router = Router();
router.use(authenticate, auditTrail('Invoice', { phi: true }));

// Cancelling or refunding reverses money that's already been billed/collected
// — kept to finance roles only, unlike day-to-day invoice/payment entry.

router.get('/invoices', requirePermission('billing:view'), validate(listInvoicesQuerySchema, 'query'), c.list);
router.get('/stats', requirePermission('billing:view'), c.stats);
router.get('/suggestions/:patientId', requirePermission('billing:view'), c.suggestions);
router.get('/invoices/:id', requirePermission('billing:view'), c.get);
router.get('/invoices/:id/pdf', requirePermission('billing:view'), c.pdf);

router.post('/invoices', requirePermission('billing:manage'), validate(createInvoiceSchema), c.create);
router.put('/invoices/:id', requirePermission('billing:manage'), validate(updateInvoiceSchema), c.update);
router.post('/invoices/:id/payments', requirePermission('billing:manage'), validate(recordPaymentSchema), c.pay);
router.patch('/invoices/:id/cancel', requirePermission('billing:reverse'), validate(cancelInvoiceSchema), c.cancel);
router.post('/invoices/:id/refund', requirePermission('billing:reverse'), validate(refundInvoiceSchema), c.refund);

export default router;
