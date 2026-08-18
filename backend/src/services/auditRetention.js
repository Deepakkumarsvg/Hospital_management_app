// Audit-log retention, applied as a TTL index per tenant database.
//
// This is declared here rather than on the schema because a TTL cannot be
// changed in place: MongoDB will not alter expireAfterSeconds on an existing
// index, so switching from five years to seven means dropping and rebuilding
// it. Doing that explicitly at boot — and being able to remove it entirely —
// is the difference between a retention policy and an accident.
import { AuditLog, AUDIT_RETENTION_DAYS } from '../models/AuditLog.js';
import { listTenants } from './tenantService.js';
import { tenantConnection } from '../db/connectionManager.js';
import { runWithTenant } from '../db/tenantContext.js';

const INDEX_NAME = 'audit_ttl';

async function applyToCurrentTenant() {
  const collection = AuditLog.collection;
  const wanted = AUDIT_RETENTION_DAYS > 0 ? AUDIT_RETENTION_DAYS * 24 * 60 * 60 : null;

  let existing;
  try {
    const indexes = await collection.indexes();
    existing = indexes.find((i) => i.name === INDEX_NAME) || null;
  } catch {
    // A collection that doesn't exist yet has no indexes and needs none —
    // it will be created with the right one the first time this runs after a
    // write.
    return { changed: false };
  }

  // Retention turned off: keep everything, and make sure a previously applied
  // TTL isn't still quietly deleting records.
  if (!wanted) {
    if (existing) {
      await collection.dropIndex(INDEX_NAME);
      return { changed: true, action: 'removed' };
    }
    return { changed: false };
  }

  if (existing?.expireAfterSeconds === wanted) return { changed: false };

  // A TTL that exists with a different window has to go before the new one can
  // be built under the same name.
  if (existing) await collection.dropIndex(INDEX_NAME).catch(() => {});

  await collection.createIndex(
    { createdAt: 1 },
    { name: INDEX_NAME, expireAfterSeconds: wanted, background: true }
  );
  return { changed: true, action: existing ? 'updated' : 'created' };
}

// Bring every tenant's audit retention in line with AUDIT_RETENTION_DAYS.
export async function ensureAuditRetention() {
  const tenants = await listTenants();
  let changed = 0;
  for (const t of tenants) {
    if (t.status !== 'ACTIVE') continue;
    const conn = tenantConnection(t.dbName);
    const r = await runWithTenant({ tenant: t, conn }, () => applyToCurrentTenant()).catch(() => ({ changed: false }));
    if (r.changed) changed += 1;
  }
  return {
    tenants: tenants.length,
    changed,
    retentionDays: AUDIT_RETENTION_DAYS || 'unlimited',
  };
}
