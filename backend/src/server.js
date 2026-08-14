import { env } from './config/env.js';
import { createApp } from './app.js';
import { connectDB } from './config/database.js';
import { startScheduler } from './services/scheduler.js';
import { ensureDefaultTenant } from './services/tenantService.js';

async function start() {
  await connectDB(env.mongoUri);
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
