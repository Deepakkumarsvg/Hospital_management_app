import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { ROLES } from '../config/roles.js';
import * as c from '../controllers/roleController.js';

const router = Router();
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/', c.listRoles);
router.get('/permissions/catalog', c.permissionCatalog);
router.put('/:name/permissions', c.updatePermissions);

export default router;
