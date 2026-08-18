import { Router } from 'express';
import * as c from '../controllers/reportController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';

const router = Router();
router.use(authenticate, auditTrail('Report', { phi: true }));

// The dashboard is open to any signed-in member of staff: it is assembled
// per-caller from only the sections their permissions allow, so gating the
// whole endpoint would hide every card from everyone but management.
router.get('/dashboard', c.dashboard);

// The reports proper are for management roles.

router.get('/summary', requirePermission('reports:view'), c.summary);
router.get('/doctor-activity', requirePermission('reports:view'), c.doctorActivity);
router.get('/export/summary', requirePermission('reports:view'), c.exportSummary);
router.get('/export/summary/pdf', requirePermission('reports:view'), c.summaryPdf);
router.get('/export/invoices', requirePermission('reports:view'), c.exportInvoices);
router.get('/export/doctor-activity', requirePermission('reports:view'), c.exportDoctorActivity);

export default router;
