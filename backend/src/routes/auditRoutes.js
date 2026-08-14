import { Router } from 'express';
import * as c from '../controllers/auditController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { ROLES } from '../config/roles.js';

const router = Router();
router.use(authenticate, authorize(ROLES.ADMIN));
router.get('/', c.list);

export default router;
