// One-off migration: money stored as floating-point rupees -> integer paise.
//
// See utils/money.js for why. Every amount below is multiplied by 100 and
// rounded to the nearest whole paisa, which is exactly the value the old
// float was trying (and sometimes failing) to represent.
//
// Safe to re-run: each collection carries a `moneyUnit` marker on the
// documents it has already converted, so a second pass is a no-op rather than
// a hundredfold inflation. That marker is the whole reason this is safe to
// run against a live database — without it there is no way to tell 800 rupees
// from 800 paise after the fact.
//
// Usage: node src/seed/migrateMoneyToPaise.js
import 'dotenv/config';
import { connectDB } from '../config/database.js';
import { env } from '../config/env.js';
import { listTenants } from '../services/tenantService.js';
import { tenantConnection } from '../db/connectionManager.js';
import { runWithTenant } from '../db/tenantContext.js';
import { Invoice } from '../models/Invoice.js';
import { Payment } from '../models/Payment.js';
import { Payslip } from '../models/Payslip.js';
import { InsuranceClaim } from '../models/InsuranceClaim.js';

// [model, top-level money fields, { arrayField: [inner money fields] }]
const PLAN = [
  [Invoice, ['subtotal', 'discount', 'tax', 'grandTotal', 'paidAmount', 'dueAmount'], { items: ['unitPrice', 'amount'] }],
  [Payment, ['amount'], {}],
  [Payslip, ['basicSalary', 'grossPay', 'adjustment', 'netPay'], {}],
  [InsuranceClaim, ['claimAmount', 'approvedAmount', 'rejectedAmount'], {}],
];

const toPaise = (v) => Math.round(Number(v || 0) * 100);

async function migrateCollection(Model, fields, arrays) {
  const collection = Model.collection;
  // Only documents that have not been converted yet.
  const cursor = collection.find({ moneyUnit: { $ne: 'paise' } });

  let converted = 0;
  for await (const doc of cursor) {
    const $set = { moneyUnit: 'paise' };
    for (const f of fields) $set[f] = toPaise(doc[f]);

    for (const [arrayName, innerFields] of Object.entries(arrays)) {
      if (!Array.isArray(doc[arrayName])) continue;
      $set[arrayName] = doc[arrayName].map((el) => {
        const next = { ...el };
        for (const f of innerFields) next[f] = toPaise(el[f]);
        return next;
      });
    }

    await collection.updateOne({ _id: doc._id }, { $set });
    converted += 1;
  }
  return converted;
}

async function migrateTenant(tenant) {
  const conn = tenantConnection(tenant.dbName);
  await runWithTenant({ tenant, conn }, async () => {
    const counts = [];
    for (const [Model, fields, arrays] of PLAN) {
      const n = await migrateCollection(Model, fields, arrays);
      counts.push(`${Model.modelName}: ${n}`);
    }
    console.log(`  - ${tenant.slug} (${tenant.dbName}): ${counts.join(', ')}`);
  });
}

async function main() {
  await connectDB(env.mongoUri);
  const tenants = await listTenants();
  console.log(`Converting money to integer paise across ${tenants.length} tenant(s)...`);
  for (const tenant of tenants) await migrateTenant(tenant);
  console.log('Migration complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
