// MUST be first. Sentry instruments http/express/mongodb as those modules
// load, so anything imported above it is never instrumented. See instrument.js.
import './instrument.js';

import mongoose from 'mongoose';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { connectDB } from './config/database.js';
import { startScheduler } from './services/scheduler.js';
import { ensureDefaultTenant } from './services/tenantService.js';
import { ensureAuditRetention } from './services/auditRetention.js';
import { ensureErrorRetention } from './services/errorRetention.js';
import { buildIndexesForAllTenants } from './services/indexService.js';
import { probeTransactionSupport } from './db/withTransaction.js';
import { installShutdownHandlers } from './shutdown.js';
import { checkRateLimitBacking } from './config/rateLimitStore.js';

async function start() {
  await connectDB(env.mongoUri);

  // Say this once at boot rather than letting the first goods receipt of the
  // day be the thing that discovers it.
  const canTransact = await probeTransactionSupport(mongoose.connection);
  if (canTransact) {
    console.log('✓ MongoDB replica set detected — transactional writes enabled');
  } else {
    console.warn(
      '⚠ MongoDB is running standalone. Flows that need multi-document atomicity\n' +
      '  (goods receipt) will refuse to run. Start mongod with --replSet rs0 and\n' +
      '  initiate the set once to enable them.'
    );
  }

  const tenant = await ensureDefaultTenant();
  console.log(`✓ Control plane ready · default tenant "${tenant.slug}" → ${tenant.dbName}`);

  // Indexes are built at boot rather than lazily on first use, so the cost
  // lands here instead of on whichever unlucky request touches a collection
  // first. Failing to build them must not stop the hospital running — a slow
  // query beats a closed hospital.
  try {
    const r = await buildIndexesForAllTenants();
    console.log(`✓ Indexes verified across ${r.tenants} tenant(s)`
      + (r.failed.length ? ` (could not build: ${r.failed.join(', ')})` : ''));
  } catch (err) {
    console.warn('⚠ Could not verify indexes:', err.message);
  }

  // Audit retention is reconciled at boot so a change to
  // AUDIT_RETENTION_DAYS takes effect on deploy rather than needing a manual
  // index rebuild. Failing to apply it must not stop the hospital running.
  try {
    const r = await ensureAuditRetention();
    console.log(`✓ Audit retention: ${r.retentionDays} day(s) across ${r.tenants} tenant(s)`);
  } catch (err) {
    console.warn('⚠ Could not apply audit retention:', err.message);
  }

  // Same again for captured errors, on a much shorter window — see
  // services/errorRetention.js for why the two differ.
  try {
    const r = await ensureErrorRetention();
    console.log(`✓ Error-log retention: ${r.retentionDays} day(s) across ${r.tenants} tenant(s)`);
  } catch (err) {
    console.warn('⚠ Could not apply error-log retention:', err.message);
  }

  checkRateLimitBacking();
  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`✓ HMS API running on http://localhost:${env.port} [${env.nodeEnv}]`);
    startScheduler();
  });

  installShutdownHandlers(server);
}

start().catch((err) => {
  console.error('✗ Failed to start server:', err);
  process.exit(1);
});
