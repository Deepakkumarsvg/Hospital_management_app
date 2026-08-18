import { Role } from '../models/Role.js';
import { ROLE_DEFINITIONS, ROLES } from '../config/roles.js';
import { ALL_PERMISSION_KEYS, defaultPermissionsFor } from '../config/permissions.js';
import { invalidateRolePermissions, permissionsFor } from '../middleware/rbac.js';
import { ApiError } from '../utils/ApiError.js';

// List roles, showing the permissions each one actually has right now —
// customised where somebody has edited them, the built-in defaults everywhere
// else. Showing an empty list for an uncustomised role (as this used to) made
// the matrix look like nobody could do anything, while the routes said
// otherwise.
export async function listRoles() {
  const existing = await Role.find({}).lean();
  const byName = existing.reduce((a, r) => ({ ...a, [r.name]: r }), {});
  return ROLE_DEFINITIONS.map((def) => {
    const stored = byName[def.name]?.permissions || [];
    const customised = stored.length > 0;
    return {
      name: def.name,
      description: def.description,
      permissions: customised ? stored : defaultPermissionsFor(def.name),
      customised,
      // SUPER_ADMIN bypasses the matrix entirely, so editing it would be a lie.
      editable: def.name !== ROLES.SUPER_ADMIN,
    };
  });
}

export async function updatePermissions(name, permissions) {
  if (name === ROLES.SUPER_ADMIN) {
    throw ApiError.badRequest(
      'SUPER_ADMIN bypasses the permission matrix and cannot be restricted by it',
      'ROLE_NOT_EDITABLE'
    );
  }

  const clean = [...new Set((permissions || []).filter((p) => ALL_PERMISSION_KEYS.includes(p)))];
  const role = await Role.findOneAndUpdate(
    { name },
    { $set: { permissions: clean } },
    { new: true, upsert: true }
  );
  if (!role) throw ApiError.notFound('Role not found', 'ROLE_NOT_FOUND');

  // Permissions are cached per tenant+role for the lifetime of the process —
  // without this the edit would appear to save and change nothing until a
  // restart, which is the exact failure this whole feature is fixing.
  invalidateRolePermissions(name);

  return { name: role.name, permissions: role.permissions };
}

// The caller's own effective permissions, so the UI can hide what the API
// would refuse anyway.
export async function permissionsForRole(name) {
  return [...await permissionsFor(name)];
}
