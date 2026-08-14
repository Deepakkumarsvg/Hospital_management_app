import { Router } from 'express';
import * as c from '../controllers/reportController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { ROLES } from '../config/roles.js';

const router = Router();
router.use(authenticate);

// Reports are for management roles.
const MGMT = [ROLES.ADMIN, ROLES.ACCOUNTANT];

router.get('/summary', authorize(...MGMT), c.summary);
router.get('/doctor-activity', authorize(...MGMT), c.doctorActivity);
router.get('/export/invoices', authorize(...MGMT), c.exportInvoices);
router.get('/export/doctor-activity', authorize(...MGMT), c.exportDoctorActivity);

export default router;
