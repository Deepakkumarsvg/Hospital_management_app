import { Role } from '../models/Role.js';
import { ROLE_DEFINITIONS } from '../config/roles.js';
import { ALL_PERMISSION_KEYS } from '../config/permissions.js';
import { ApiError } from '../utils/ApiError.js';

// List roles (seeding any that are missing from the catalogue on the fly).
export async function listRoles() {
  const existing = await Role.find({}).lean();
  const byName = existing.reduce((a, r) => ({ ...a, [r.name]: r }), {});
  return ROLE_DEFINITIONS.map((def) => ({
    name: def.name,
    description: def.description,
    permissions: byName[def.name]?.permissions || [],
  }));
}

export async function updatePermissions(name, permissions) {
  const clean = [...new Set((permissions || []).filter((p) => ALL_PERMISSION_KEYS.includes(p)))];
  const role = await Role.findOneAndUpdate(
    { name },
    { $set: { permissions: clean } },
    { new: true, upsert: true }
  );
  if (!role) throw ApiError.notFound('Role not found', 'ROLE_NOT_FOUND');
  return { name: role.name, permissions: role.permissions };
}

export async function permissionsForRole(name) {
  const role = await Role.findOne({ name }).select('permissions').lean();
  return role?.permissions || [];
}
