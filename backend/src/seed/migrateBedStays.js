// One-off migration: give existing admissions a bed-stay segment.
//
// Bed charges are derived from IPDAdmission.bedStays (see services/
// bedCharges.js). Admissions created before that field existed have none, and
// would bill nothing at all. This opens a single segment covering the whole
// stay, using the bed the admission currently points at.
//
// That is exactly right for anyone who never transferred. For anyone who did,
// the earlier occupancy was never recorded anywhere and cannot be recovered —
// the whole stay is attributed to the final bed, which is the closest thing to
// the truth that still exists. New transfers record themselves properly.
//
// Safe to re-run: only admissions with no segments are touched.
// Usage: node src/seed/migrateBedStays.js
import 'dotenv/config';
import { connectDB } from '../config/database.js';
import { env } from '../config/env.js';
import { listTenants } from '../services/tenantService.js';
import { tenantConnection } from '../db/connectionManager.js';
import { runWithTenant } from '../db/tenantContext.js';
import { IPDAdmission } from '../models/IPDAdmission.js';
import { Bed } from '../models/Bed.js';

async function migrateTenant(tenant) {
  const conn = tenantConnection(tenant.dbName);
  await runWithTenant({ tenant, conn }, async () => {
    const admissions = await IPDAdmission.find({
      $or: [{ bedStays: { $exists: false } }, { bedStays: { $size: 0 } }],
    });

    let migrated = 0;
    let skipped = 0;
    for (const adm of admissions) {
      const bed = await Bed.findById(adm.bed).select('bedNo dailyCharge ward room');
      if (!bed) { skipped += 1; continue; }

      adm.bedStays = [{
        bed: bed._id,
        ward: adm.ward || bed.ward,
        room: adm.room || bed.room,
        bedNo: bed.bedNo,
        dailyCharge: bed.dailyCharge || 0,
        from: adm.admissionDate,
        to: adm.dischargeDate || null,
      }];
      await adm.save();
      migrated += 1;
    }
    console.log(
      `  - ${tenant.slug} (${tenant.dbName}): ${migrated} admission(s) backfilled`
      + (skipped ? `, ${skipped} skipped (bed no longer exists)` : '')
    );
  });
}

async function main() {
  await connectDB(env.mongoUri);
  const tenants = await listTenants();
  console.log(`Backfilling bed stays across ${tenants.length} tenant(s)...`);
  for (const tenant of tenants) await migrateTenant(tenant);
  console.log('Migration complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
