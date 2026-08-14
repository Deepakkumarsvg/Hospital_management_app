// Resolve the tenant for a request and bind its database connection into the
// AsyncLocalStorage context for the rest of the pipeline.
import { env } from '../config/env.js';
import { getTenantBySlug, ensureDefaultTenant } from '../services/tenantService.js';
import { tenantConnection } from '../db/connectionManager.js';
import { runWithTenant } from '../db/tenantContext.js';
import { ApiError } from '../utils/ApiError.js';

// Work out which tenant slug the request is for.
function slugFromRequest(req) {
  if (env.tenancyMode === 'subdomain') {
    const host = (req.headers.host || '').split(':')[0];
    const parts = host.split('.');
    // apollo.hms.local → "apollo"; bare host → default
    if (parts.length > env.baseDomain.split('.').length) return parts[0];
    return env.defaultTenantSlug;
  }
  // header/dev mode: explicit header/query/body, else default.
  return (
    req.headers['x-tenant'] ||
    req.query.tenant ||
    req.body?.tenantCode ||
    env.defaultTenantSlug
  );
}

// Sets req.tenant. Falls back to (and lazily creates) the default tenant so a
// vanilla single-tenant deployment keeps working with no client changes.
export async function resolveTenant(req, _res, next) {
  try {
    const slug = String(slugFromRequest(req)).toLowerCase();
    let tenant = await getTenantBySlug(slug);
    if (!tenant && slug === env.defaultTenantSlug) tenant = await ensureDefaultTenant();
    if (!tenant) throw ApiError.notFound(`Unknown hospital "${slug}"`, 'TENANT_NOT_FOUND');
    if (tenant.status !== 'ACTIVE') throw ApiError.forbidden('Hospital is suspended', 'TENANT_SUSPENDED');
    req.tenant = tenant;
    next();
  } catch (err) {
    next(err);
  }
}

// Binds the tenant DB connection into async context for the rest of the request.
export function tenantScope(req, _res, next) {
  const conn = tenantConnection(req.tenant.dbName);
  runWithTenant({ tenant: req.tenant, conn }, () => next());
}
