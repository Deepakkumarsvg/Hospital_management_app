// Where rate-limit counters live.
//
// The default store is in-process memory, which means each instance keeps its
// own budget. Behind a load balancer with four instances, a limit of "10 login
// attempts per 15 minutes" is really forty — and a restart resets it to zero.
// For a login endpoint that is the difference between a working control and a
// decorative one.
//
// Redis makes the budget shared and survives restarts. It is OPTIONAL: with no
// REDIS_URL the app falls back to memory, which is correct for a single-instance
// deployment and keeps local development dependency-free. What is not
// acceptable is running several instances *without* it, so that combination is
// called out loudly at boot.
import { createClient } from 'redis';
import RedisStore from 'rate-limit-redis';

let client = null;
let connecting = null;

export const isRedisConfigured = () => Boolean(process.env.REDIS_URL);

async function connect() {
  if (client) return client;
  connecting ??= (async () => {
    const c = createClient({ url: process.env.REDIS_URL });
    // A dropped Redis connection must not take the API down with it — the
    // limiter degrades to allowing traffic, which is the right failure
    // direction for a hospital.
    c.on('error', (err) => console.warn('⚠ Redis (rate limiting):', err.message));
    await c.connect();
    client = c;
    return c;
  })();
  return connecting;
}

// A store for express-rate-limit, or undefined to use its in-memory default.
export function rateLimitStore(prefix) {
  if (!isRedisConfigured()) return undefined;

  return new RedisStore({
    prefix: `rl:${prefix}:`,
    // rate-limit-redis calls this for every command; connect() is memoised so
    // this does not open a connection per request.
    sendCommand: async (...args) => (await connect()).sendCommand(args),
  });
}

// Warn once at boot if the combination is unsafe.
export function checkRateLimitBacking() {
  if (isRedisConfigured()) {
    console.log('✓ Rate limiting backed by Redis (shared across instances)');
    return;
  }
  console.warn(
    '⚠ Rate limiting is per-process (no REDIS_URL).\n'
    + '  This is fine for a single instance. Running more than one means every\n'
    + '  limit is multiplied by the instance count — including the login limit —\n'
    + '  and all counters reset on deploy. Set REDIS_URL before scaling out.'
  );
}

export async function closeRateLimitStore() {
  if (client) {
    await client.quit().catch(() => {});
    client = null;
    connecting = null;
  }
}
