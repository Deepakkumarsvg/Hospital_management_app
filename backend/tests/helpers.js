// Shared test harness for the multi-tenant app.
//
// Tests run against an isolated control DB + a default-tenant test DB. Direct
// model access in setup is wrapped in the tenant context via inTenant(); HTTP
// requests through supertest get their context from the app middleware.
import mongoose from 'mongoose';
import request from 'supertest';

// Configure tenancy for tests BEFORE importing app/env.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_that_is_long_enough_1234';
process.env.JWT_EXPIRES_IN = '1d';
const TEST_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/hms_test';
process.env.MONGODB_URI = TEST_URI;
process.env.CONTROL_DB = 'hms_control_test';
process.env.DEFAULT_TENANT_DB = 'hms_test';           // default tenant uses the test DB
process.env.TENANCY_MODE = 'header';

const { createApp } = await import('../src/app.js');
const { Role } = await import('../src/models/Role.js');
const { User } = await import('../src/models/User.js');
const { ROLE_DEFINITIONS, ROLES } = await import('../src/config/roles.js');
const { ensureDefaultTenant } = await import('../src/services/tenantService.js');
const { tenantConnection } = await import('../src/db/connectionManager.js');
const { runWithTenant } = await import('../src/db/tenantContext.js');

export const app = createApp();
export { ROLES };

let defaultStore = null;

// Run a function inside the default tenant's DB context.
export function inTenant(fn) {
  return runWithTenant(defaultStore, fn);
}

export async function connectTestDb() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 8000 });
  }
  // Clean both the tenant DB and the control DB.
  await mongoose.connection.useDb('hms_test').dropDatabase();
  await mongoose.connection.useDb('hms_control_test').dropDatabase();

  const tenant = await ensureDefaultTenant();
  defaultStore = { tenant, conn: tenantConnection(tenant.dbName) };
}

export async function disconnectTestDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.useDb('hms_test').dropDatabase();
    await mongoose.connection.useDb('hms_control_test').dropDatabase();
    await mongoose.disconnect();
  }
}

// Seed roles + an admin and a receptionist into the default tenant.
export async function seedBase() {
  await inTenant(async () => {
    for (const def of ROLE_DEFINITIONS) {
      await Role.updateOne({ name: def.name }, { $set: def }, { upsert: true });
    }
    const admin = new User({ name: 'Admin', email: 'admin@test.local', role: ROLES.SUPER_ADMIN, status: 'ACTIVE' });
    await admin.setPassword('Admin@123');
    await admin.save();

    const recep = new User({ name: 'Reception', email: 'recep@test.local', role: ROLES.RECEPTIONIST, status: 'ACTIVE' });
    await recep.setPassword('Recep@123');
    await recep.save();
  });
}

export async function login(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body?.data?.token;
}

export function auth(token) {
  return { Authorization: `Bearer ${token}` };
}
