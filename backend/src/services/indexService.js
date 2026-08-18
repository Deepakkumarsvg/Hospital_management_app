// Build the declared indexes in every tenant database.
//
// Each hospital has its own database, so an index declared on a schema has to
// be built once per tenant — a new hospital provisioned last week has none of
// them until something says so.
import { buildIndexes, declareIndexes } from '../models/indexes.js';
import { listTenants } from './tenantService.js';
import { tenantConnection } from '../db/connectionManager.js';
import { runWithTenant } from '../db/tenantContext.js';

declareIndexes();

export async function buildIndexesForAllTenants() {
  const tenants = await listTenants();
  const failed = new Set();
  let count = 0;

  for (const t of tenants) {
    if (t.status !== 'ACTIVE') continue;
    const conn = tenantConnection(t.dbName);
    const r = await runWithTenant({ tenant: t, conn }, () => buildIndexes())
      .catch(() => ({ failed: ['(all)'] }));
    for (const f of r.failed || []) failed.add(`${t.slug}:${f}`);
    count += 1;
  }

  return { tenants: count, failed: [...failed] };
}
