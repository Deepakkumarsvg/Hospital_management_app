import { ApiError } from '../utils/ApiError.js';
import { ROLES } from '../config/roles.js';
import { Role } from '../models/Role.js';
import { defaultPermissionsFor } from '../config/permissions.js';
import { currentTenant } from '../db/tenantContext.js';

// Restrict a route to one or more roles. SUPER_ADMIN always passes.
//
// Prefer requirePermission() for anything a hospital might reasonably want to
// re-assign. This remains for guards that are about *identity* rather than
// capability — the cross-tenant console belongs to the platform operator and
// is not a permission a hospital admin can be granted.
export function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized('Not authenticated', 'NOT_AUTHENTICATED'));

    if (req.user.role === ROLES.SUPER_ADMIN) return next();

    if (allowedRoles.length && !allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action', 'FORBIDDEN'));
    }
    next();
  };
}

// Resolved permissions per (tenant, role).
//
// Every request needs this, and it changes only when an admin edits the
// matrix — so it is cached rather than re-read each time, and the cache is
// dropped explicitly on edit (see invalidateRolePermissions). Keyed by tenant
// as well as role because each hospital has its own roles collection.
const cache = new Map();
const cacheKey = (tenantSlug, role) => `${tenantSlug}::${role}`;

export function invalidateRolePermissions(role = null) {
  if (!role) return cache.clear();
  for (const key of cache.keys()) {
    if (key.endsWith(`::${role}`)) cache.delete(key);
  }
}

// What a role can actually do here.
//
// A role document with no permissions stored has never been customised, so it
// falls back to the built-in defaults. That fallback is what lets enforcement
// be switched on without a migration: an untouched deployment behaves exactly
// as it did when the guards were hard-coded role arrays.
//
// An empty list is therefore "not configured", not "denied everything". To
// actually strip a role bare, remove it from the matrix rather than saving it
// empty — a role that can do nothing is better expressed by not assigning it.
export async function permissionsFor(role) {
  const tenantSlug = currentTenant()?.slug || 'default';
  const key = cacheKey(tenantSlug, role);
  if (cache.has(key)) return cache.get(key);

  let stored = [];
  try {
    const doc = await Role.findOne({ name: role }).select('permissions').lean();
    stored = doc?.permissions || [];
  } catch {
    // A roles collection that cannot be read must not lock everyone out of a
    // running hospital; fall back to the defaults.
  }

  const effective = new Set(stored.length ? stored : defaultPermissionsFor(role));
  cache.set(key, effective);
  return effective;
}

// Guard a route on one or more permission keys.
//
// Semantics are ANY-of: several roles may legitimately reach the same endpoint
// by different routes through the matrix. Changing a lab order's status, for
// instance, is open to whoever may order tests and whoever may process them.
export function requirePermission(...keys) {
  return async (req, _res, next) => {
    try {
      if (!req.user) throw ApiError.unauthorized('Not authenticated', 'NOT_AUTHENTICATED');
      if (req.user.role === ROLES.SUPER_ADMIN) return next();

      const granted = await permissionsFor(req.user.role);
      if (keys.some((k) => granted.has(k))) return next();

      throw ApiError.forbidden(
        'You do not have permission to perform this action',
        'FORBIDDEN',
        { required: keys }
      );
    } catch (err) {
      next(err);
    }
  };
}
