import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as c from '../controllers/portalController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePatient } from '../middleware/portal.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, bookAppointmentSchema } from '../validators/portalValidator.js';

const router = Router();

// Self-registration creates a Patient record and a login from an unauthenticated
// request — the one endpoint here that lets a stranger write to the database.
// A handful per hour per address is well above what a real person needs and
// well below what makes bulk account creation worthwhile.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many registration attempts. Please try again later.' },
});

// Public — self registration (login uses the shared POST /api/auth/login).
router.post('/register', registerLimiter, validate(registerSchema), c.register);

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
