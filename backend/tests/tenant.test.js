import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { app, connectTestDb, disconnectTestDb, seedBase, login, auth } from './helpers.js';

// A second tenant provisioned via the API, to prove database isolation.
const SLUG = 'zeta';
const DBNAME = 'hms_zeta';

let defaultToken;
let zetaToken;

function tenantHeaders(token, slug) {
  return { Authorization: `Bearer ${token}`, 'X-Tenant': slug };
}

beforeAll(async () => {
  await connectTestDb();
  await seedBase();
  defaultToken = await login('admin@test.local', 'Admin@123');

  // Provision a second hospital.
  await request(app).post('/api/ops/tenants').set(auth(defaultToken))
    .send({ slug: SLUG, name: 'Zeta Hospital', adminPassword: 'Zeta@123' });

  const res = await request(app).post('/api/auth/login')
    .set('X-Tenant', SLUG)
    .send({ email: 'admin@zeta.local', password: 'Zeta@123' });
  zetaToken = res.body?.data?.token;
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.useDb(DBNAME).dropDatabase();
  }
  await disconnectTestDb();
});

describe('Tenant isolation', () => {
  it('provisions a second hospital with its own admin', async () => {
    expect(zetaToken).toBeTruthy();
  });

  it('keeps patient data isolated per hospital', async () => {
    // Create a patient in the DEFAULT hospital.
    await request(app).post('/api/patients').set(auth(defaultToken)).send({
      firstName: 'Default', lastName: 'Patient', gender: 'MALE', dateOfBirth: '1990-01-01', phone: '9000000001',
    });
    // Create a patient in ZETA hospital.
    await request(app).post('/api/patients').set(tenantHeaders(zetaToken, SLUG)).send({
      firstName: 'Zeta', lastName: 'Patient', gender: 'FEMALE', dateOfBirth: '1992-02-02', phone: '9000000002',
    });

    const dRes = await request(app).get('/api/patients').set(auth(defaultToken));
    const zRes = await request(app).get('/api/patients').set(tenantHeaders(zetaToken, SLUG));

    const dNames = dRes.body.data.map((p) => p.firstName);
    const zNames = zRes.body.data.map((p) => p.firstName);

    expect(dNames).toContain('Default');
    expect(dNames).not.toContain('Zeta');   // no leak into default
    expect(zNames).toContain('Zeta');
    expect(zNames).not.toContain('Default'); // no leak into zeta
  });

  it("rejects a token minted for one hospital used on another", async () => {
    const res = await request(app).get('/api/patients').set(tenantHeaders(defaultToken, SLUG));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('TENANT_MISMATCH');
  });

  it('rejects a token carrying no tenant claim at all', async () => {
    // A token that simply omits the claim must not be a way around the check.
    // (This is the shape older tokens had, and they used to be waved through.)
    const jwt = (await import('jsonwebtoken')).default;
    const claimless = jwt.sign({ sub: '000000000000000000000000', role: 'ADMIN' }, process.env.JWT_SECRET);

    const res = await request(app).get('/api/patients').set(auth(claimless));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('TENANT_MISMATCH');
  });

  it('binds a self-registered patient token to the hospital that issued it', async () => {
    const email = `selfreg-${Date.now()}@example.com`;
    const reg = await request(app).post('/api/portal/register').set('X-Tenant', SLUG).send({
      firstName: 'Self', lastName: 'Reg', gender: 'MALE', dateOfBirth: '1995-05-05',
      phone: '9000000055', email, password: 'Patient@123',
    });
    expect(reg.status).toBe(201);
    const patientToken = reg.body.data.token;

    // Valid on the hospital it was issued for...
    const ok = await request(app).get('/api/portal/me').set(tenantHeaders(patientToken, SLUG));
    expect(ok.status).toBe(200);

    // ...and refused on any other.
    const wrong = await request(app).get('/api/portal/me').set(auth(patientToken));
    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toBe('TENANT_MISMATCH');
  });

  it('lists both tenants in the registry', async () => {
    const res = await request(app).get('/api/ops/tenants').set(auth(defaultToken));
    const slugs = res.body.data.map((t) => t.slug);
    expect(slugs).toContain('default');
    expect(slugs).toContain(SLUG);
  });
});
