import mongoose from 'mongoose';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { connectDB } from './config/database.js';
import { startScheduler } from './services/scheduler.js';
import { ensureDefaultTenant } from './services/tenantService.js';
import { probeTransactionSupport } from './db/withTransaction.js';

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
  const app = createApp();
  app.listen(env.port, () => {
    console.log(`✓ HMS API running on http://localhost:${env.port} [${env.nodeEnv}]`);
    startScheduler();
  });
}

start().catch((err) => {
  console.error('✗ Failed to start server:', err);
  process.exit(1);
});
