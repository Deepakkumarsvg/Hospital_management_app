import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { ROLES } from '../config/roles.js';
import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import { PERMISSION_CATALOG, PERMISSION_MODULES, PERMISSION_ACTIONS } from '../config/permissions.js';
import * as service from '../services/roleService.js';

const router = Router();
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/', asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Roles', data: await service.listRoles() })));

router.get('/permissions/catalog', (_req, res) =>
  sendSuccess(res, { message: 'Permission catalog', data: { catalog: PERMISSION_CATALOG, modules: PERMISSION_MODULES, actions: PERMISSION_ACTIONS } }));

router.put('/:name/permissions', asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Permissions updated', data: await service.updatePermissions(req.params.name, req.body.permissions) })));

export default router;
