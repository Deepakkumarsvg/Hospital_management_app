// Control-plane: the Tenant registry. Lives in the control database (NOT tenant
// scoped) and maps a hospital's slug → its database name.
import mongoose from 'mongoose';
import { controlConnection, tenantConnection } from '../db/connectionManager.js';
import { runWithTenant } from '../db/tenantContext.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { ROLE_DEFINITIONS, ROLES } from '../config/roles.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { Setting } from '../models/Setting.js';

const tenantSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true }, // "apollo"
    name: { type: String, required: true, trim: true },                                 // "Apollo Hospital"
    dbName: { type: String, required: true, unique: true, trim: true },                 // "hms_apollo"
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE' },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

// Bind the model on the control connection (once).
function TenantModel() {
  const conn = controlConnection();
  return conn.models.Tenant || conn.model('Tenant', tenantSchema);
}

// Small in-memory cache so we don't hit the control DB on every request.
const cache = new Map(); // slug -> { tenant, at }
const TTL_MS = 60_000;

function cacheGet(slug) {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.tenant;
  return null;
}
function cacheSet(slug, tenant) {
  cache.set(slug, { tenant, at: Date.now() });
}
export function clearTenantCache() {
  cache.clear();
}

export async function getTenantBySlug(slug) {
  if (!slug) return null;
  const key = String(slug).toLowerCase();
  const cached = cacheGet(key);
  if (cached) return cached;
  const tenant = await TenantModel().findOne({ slug: key }).lean();
  if (tenant) cacheSet(key, tenant);
  return tenant;
}

export async function listTenants() {
  return TenantModel().find({}).sort({ createdAt: 1 }).lean();
}

export async function createTenant({ slug, name, dbName }) {
  const clean = String(slug).toLowerCase().trim();
  if (!/^[a-z0-9-]{2,30}$/.test(clean)) {
    throw ApiError.badRequest('Slug must be 2-30 chars: a-z, 0-9, hyphen', 'BAD_SLUG');
  }
  if (await TenantModel().findOne({ slug: clean })) {
    throw ApiError.conflict('A hospital with this slug already exists', 'TENANT_EXISTS');
  }
  const tenant = await TenantModel().create({
    slug: clean,
    name: name || clean,
    dbName: dbName || `hms_${clean}`,
  });
  clearTenantCache();
  return tenant.toObject();
}

export async function setTenantStatus(slug, status) {
  const tenant = await TenantModel().findOneAndUpdate(
    { slug: String(slug).toLowerCase() },
    { $set: { status } },
    { new: true }
  );
  if (!tenant) throw ApiError.notFound('Tenant not found', 'TENANT_NOT_FOUND');
  clearTenantCache();
  return tenant.toObject();
}

// Onboard a new hospital: register it, then seed its database with the
// essentials (roles + settings + an admin login) inside its own context.
export async function provisionTenant({ slug, name, adminEmail, adminPassword }) {
  const tenant = await createTenant({ slug, name });
  const conn = tenantConnection(tenant.dbName);
  const admin = {
    email: (adminEmail || `admin@${tenant.slug}.local`).toLowerCase(),
    password: adminPassword || 'Admin@123',
  };
  await runWithTenant({ tenant, conn }, async () => {
    for (const def of ROLE_DEFINITIONS) {
      await Role.updateOne({ name: def.name }, { $set: def }, { upsert: true });
    }
    await Setting.updateOne({ key: 'hospital' }, { $setOnInsert: { key: 'hospital', hospitalName: tenant.name } }, { upsert: true });
    if (!(await User.findOne({ email: admin.email }))) {
      const u = new User({ name: 'System Administrator', email: admin.email, role: ROLES.SUPER_ADMIN, status: 'ACTIVE' });
      await u.setPassword(admin.password);
      await u.save();
    }
  });
  return { tenant, admin };
}

// Ensure the fallback 'default' tenant exists, reusing the existing app DB so no
// data migration is needed. Called at boot.
export async function ensureDefaultTenant() {
  const slug = env.defaultTenantSlug;
  const existing = await TenantModel().findOne({ slug });
  if (existing) return existing.toObject();
  const tenant = await TenantModel().create({
    slug, name: 'Default Hospital', dbName: env.defaultTenantDb,
  });
  clearTenantCache();
  return tenant.toObject();
}
