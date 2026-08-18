// Error-log retention, applied as a TTL index per tenant database.
//
// Same reasoning as services/auditRetention.js: MongoDB will not change
// expireAfterSeconds on an existing index, so a retention change means dropping
// and rebuilding it, and that is done explicitly at boot rather than left to
// whoever remembers.
//
// What differs is the window. Audit entries are a clinical-access record kept
// for years; these are operational data with no such obligation — a failure
// nobody has hit in a month is either fixed or not worth a row. The TTL runs on
// lastSeenAt, not createdAt, so an old bug that is STILL happening is never
// expired out from under you.
import { ErrorLog, ERROR_RETENTION_DAYS } from '../models/ErrorLog.js';
import { listTenants } from './tenantService.js';
import { tenantConnection } from '../db/connectionManager.js';
import { runWithTenant } from '../db/tenantContext.js';

const INDEX_NAME = 'errorlog_ttl';

async function applyToCurrentTenant() {
  const collection = ErrorLog.collection;
  const wanted = ERROR_RETENTION_DAYS > 0 ? ERROR_RETENTION_DAYS * 24 * 60 * 60 : null;

  let existing;
  try {
    const indexes = await collection.indexes();
    existing = indexes.find((i) => i.name === INDEX_NAME) || null;
  } catch {
    // No collection yet means nothing to expire; it gets the right index the
    // first time this runs after a write.
    return { changed: false };
  }

  if (!wanted) {
    if (existing) {
      await collection.dropIndex(INDEX_NAME);
      return { changed: true, action: 'removed' };
    }
    return { changed: false };
  }

  if (existing?.expireAfterSeconds === wanted) return { changed: false };

  if (existing) await collection.dropIndex(INDEX_NAME).catch(() => {});

  await collection.createIndex(
    { lastSeenAt: 1 },
    { name: INDEX_NAME, expireAfterSeconds: wanted, background: true }
  );
  return { changed: true, action: existing ? 'updated' : 'created' };
}

export async function ensureErrorRetention() {
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
    retentionDays: ERROR_RETENTION_DAYS || 'unlimited',
  };
}
