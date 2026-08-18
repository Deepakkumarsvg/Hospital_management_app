import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';
import * as c from '../controllers/roleController.js';

const router = Router();
router.use(authenticate, requirePermission('roles:manage'), auditTrail('Role'));

router.get('/', c.listRoles);
router.get('/permissions/catalog', c.permissionCatalog);
router.put('/:name/permissions', c.updatePermissions);

export default router;
