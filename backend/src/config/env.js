// Centralised environment loading + validation.
// Fails fast at startup with a clear message instead of surfacing cryptic
// runtime errors later (e.g. undefined JWT secret → invalid tokens).
import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

// Placeholder/weak values that must never reach production.
const WEAK_SECRETS = new Set(['change_this_secret', 'CHANGE_THIS_SECRET', 'secret', 'changeme', '']);

function fail(messages) {
  console.error('\n✗ Invalid environment configuration:');
  for (const m of messages) console.error('  •', m);
  console.error('\n  Fix your backend/.env (see backend/.env.example) and restart.\n');
  process.exit(1);
}

function validate() {
  const errors = [];

  if (!process.env.MONGODB_URI) {
    errors.push('MONGODB_URI is required (e.g. mongodb://localhost:27017/hospital_management).');
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    errors.push('JWT_SECRET is required.');
  } else if (WEAK_SECRETS.has(secret)) {
    errors.push('JWT_SECRET is set to a placeholder/weak value — set a strong random secret.');
  } else if (isProd && secret.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters in production.');
  }

  if (isProd && (!process.env.CLIENT_URL || process.env.CLIENT_URL === '*')) {
    errors.push('CLIENT_URL must be an explicit origin in production (wildcard CORS is unsafe).');
  }

  const driver = (process.env.STORAGE_DRIVER || 'local').toLowerCase();
  if (driver === 's3') {
    const missing = ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].filter((k) => !process.env[k]);
    if (missing.length) {
      errors.push(`STORAGE_DRIVER=s3 requires ${missing.join(', ')}.`);
    }
  } else if (isProd) {
    // Local disk on a host with an ephemeral filesystem (Render, Fly, Heroku)
    // silently loses every uploaded document on the next deploy. This is a
    // warning rather than an error because a deployment with a real mounted
    // volume — docker compose, a VM — is perfectly valid.
    console.warn(
      '\n⚠ STORAGE_DRIVER=local in production.\n' +
      '  Uploaded documents are written to the container filesystem. If that\n' +
      '  filesystem is ephemeral, every deploy will delete them. Set\n' +
      '  STORAGE_DRIVER=s3, or make sure uploads/ is a persistent volume.\n'
    );
  }

  if (errors.length) fail(errors);
}

validate();

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd,
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  clientUrl: process.env.CLIENT_URL || '*',
  storageDriver: process.env.STORAGE_DRIVER || 'local',

  // --- Multi-tenancy (DB-per-tenant) ---
  // The base connection is a pool; per-tenant databases are selected with
  // connection.useDb(<dbName>). The control database holds the Tenant registry.
  controlDb: process.env.CONTROL_DB || 'hms_control',
  // How a request's tenant is resolved: 'subdomain' | 'header' (dev-friendly).
  tenancyMode: process.env.TENANCY_MODE || 'header',
  // Base domain for subdomain mode, e.g. "hms.local" → apollo.hms.local.
  baseDomain: process.env.BASE_DOMAIN || 'hms.local',
  // The fallback tenant used when none is specified (keeps single-tenant working).
  defaultTenantSlug: process.env.DEFAULT_TENANT_SLUG || 'default',
  // The default tenant reuses the existing app database, so no data migration.
  defaultTenantDb: process.env.DEFAULT_TENANT_DB
    || (process.env.MONGODB_URI ? new URL(process.env.MONGODB_URI).pathname.slice(1) : 'hospital_management'),
};
