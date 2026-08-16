// One-off migration: backfill Appointment.slotDay and build the unique slot
// indexes.
//
// The indexes deliberately skip documents without a `slotDay` string, so an
// existing deployment keeps working until this has run — but until it does,
// old appointments are not protected against double-booking. Run it once after
// deploying.
//
// Safe to re-run. If it reports duplicates, two active appointments already
// share a doctor/patient slot: resolve those by hand (cancel one), then re-run.
//
// Usage: node src/seed/migrateSlotDay.js
import 'dotenv/config';
import { connectDB } from '../config/database.js';
import { env } from '../config/env.js';
import { listTenants } from '../services/tenantService.js';
import { tenantConnection } from '../db/connectionManager.js';
import { runWithTenant } from '../db/tenantContext.js';
import { Appointment, toSlotDay } from '../models/Appointment.js';

async function migrateTenant(tenant) {
  const conn = tenantConnection(tenant.dbName);
  await runWithTenant({ tenant, conn }, async () => {
    const collection = Appointment.collection;

    let filled = 0;
    for await (const doc of collection.find({ slotDay: { $in: [null, ''] } })) {
      if (!doc.date) continue;
      await collection.updateOne({ _id: doc._id }, { $set: { slotDay: toSlotDay(doc.date) } });
      filled += 1;
    }

    try {
      await Appointment.syncIndexes();
      console.log(`  - ${tenant.slug} (${tenant.dbName}): backfilled ${filled}, slot indexes ready`);
    } catch (err) {
      // A duplicate-key failure here is data, not a bug: it means the DB
      // already contains a double-booking that the index would forbid.
      console.error(
        `  ! ${tenant.slug} (${tenant.dbName}): backfilled ${filled}, but the slot index could not be built.\n` +
        `    ${err.message}\n` +
        `    Cancel one of the clashing appointments, then re-run this migration.`
      );
    }
  });
}

async function main() {
  await connectDB(env.mongoUri);
  const tenants = await listTenants();
  console.log(`Backfilling Appointment.slotDay across ${tenants.length} tenant(s)...`);
  for (const tenant of tenants) await migrateTenant(tenant);
  console.log('Migration complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
