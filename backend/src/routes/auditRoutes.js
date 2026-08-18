import { Router } from 'express';
import * as c from '../controllers/auditController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();
router.use(authenticate, requirePermission('audit:view'));
router.get('/', c.list);
router.get('/facets', c.facets);
router.get('/export', c.exportLogs);

export default router;
