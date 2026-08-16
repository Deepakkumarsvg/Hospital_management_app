// One-off migration: Patient.insurance (single object) -> Patient.insurances (array).
// Safe to re-run — only touches documents that still carry the legacy field.
// Usage: node src/seed/migrateInsurance.js
import 'dotenv/config';
import { connectDB } from '../config/database.js';
import { env } from '../config/env.js';
import { listTenants } from '../services/tenantService.js';
import { tenantConnection } from '../db/connectionManager.js';
import { runWithTenant } from '../db/tenantContext.js';
import { Patient } from '../models/Patient.js';

async function migrateTenant(tenant) {
  const conn = tenantConnection(tenant.dbName);
  await runWithTenant({ tenant, conn }, async () => {
    const collection = Patient.collection;
    const cursor = collection.find({ insurance: { $exists: true } });
    let migrated = 0;
    for await (const doc of cursor) {
      const old = doc.insurance || {};
      const hasData = old.provider || old.policyNumber || old.validTill;
      const insurances = hasData
        ? [{ provider: old.provider || '', policyNumber: old.policyNumber || '', validTill: old.validTill || null }]
        : [];
      await collection.updateOne(
        { _id: doc._id },
        { $set: { insurances }, $unset: { insurance: '' } }
      );
      migrated++;
    }
    console.log(`  - ${tenant.slug} (${tenant.dbName}): migrated ${migrated} patient(s)`);
  });
}

async function main() {
  await connectDB(env.mongoUri);
  const tenants = await listTenants();
  console.log(`Scanning ${tenants.length} tenant(s) for legacy Patient.insurance...`);
  for (const tenant of tenants) {
    await migrateTenant(tenant);
  }
  console.log('Migration complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
