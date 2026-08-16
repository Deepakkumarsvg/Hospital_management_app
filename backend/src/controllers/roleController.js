import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import { PERMISSION_CATALOG, PERMISSION_MODULES, PERMISSION_ACTIONS } from '../config/permissions.js';
import { audit } from '../utils/audit.js';
import * as service from '../services/roleService.js';

export const listRoles = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Roles', data: await service.listRoles() }));

export const permissionCatalog = (_req, res) =>
  sendSuccess(res, { message: 'Permission catalog', data: { catalog: PERMISSION_CATALOG, modules: PERMISSION_MODULES, actions: PERMISSION_ACTIONS } });

// Permission changes control what every user of a role can do — always audited.
export const updatePermissions = asyncHandler(async (req, res) => {
  const updated = await service.updatePermissions(req.params.name, req.body.permissions);
  audit(req, {
    action: 'UPDATE',
    module: 'Role',
    recordId: req.params.name,
    description: `Updated permissions for role ${req.params.name} (${updated.permissions.length} granted)`,
    meta: { permissions: updated.permissions },
  });
  sendSuccess(res, { message: 'Permissions updated', data: updated });
});
