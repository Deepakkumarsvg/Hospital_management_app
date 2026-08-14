import { Router } from 'express';
import * as c from '../controllers/portalController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePatient } from '../middleware/portal.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, bookAppointmentSchema } from '../validators/portalValidator.js';

const router = Router();

// Public — self registration (login uses the shared POST /api/auth/login).
router.post('/register', validate(registerSchema), c.register);

// Everything below requires a logged-in PATIENT account.
router.use(authenticate, requirePatient);

router.get('/me', c.me);
router.get('/summary', c.summary);
router.get('/doctors', c.doctors);

router.get('/appointments', c.appointments);
router.post('/appointments', validate(bookAppointmentSchema), c.book);
router.post('/appointments/:id/cancel', c.cancel);
router.post('/appointments/:id/reschedule', validate(bookAppointmentSchema.partial()), c.reschedule);

router.get('/prescriptions', c.prescriptions);
router.get('/prescriptions/:id/pdf', c.prescriptionPdf);
router.get('/lab-orders', c.labOrders);
router.get('/radiology-orders', c.radOrders);
router.get('/invoices', c.invoices);
router.get('/invoices/:id/pdf', c.invoicePdf);
router.post('/invoices/:id/pay/order', c.payOrder);
router.post('/invoices/:id/pay/verify', c.payVerify);

export default router;
