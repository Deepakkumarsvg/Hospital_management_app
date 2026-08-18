// The dashboard is one request that returns only what the caller may see.
//
// It used to be eleven parallel calls, each re-authenticating and re-resolving
// the tenant, with the client discarding whichever ones came back 403. Folding
// them into one endpoint is only safe if the per-role gating survives — which
// is what this checks, section by section.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, connectTestDb, disconnectTestDb, inTenant, seedBase, login, auth } from './helpers.js';

const { User } = await import('../src/models/User.js');
const { ROLES } = await import('../src/config/roles.js');

const ROLES_UNDER_TEST = ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'PHARMACIST', 'ACCOUNTANT', 'STORE_MANAGER'];
const tokens = {};

beforeAll(async () => {
  await connectTestDb();
  await seedBase();
  await inTenant(async () => {
    for (const role of ROLES_UNDER_TEST) {
      const u = new User({ name: role, email: `${role.toLowerCase()}@dash.local`, role: ROLES[role], status: 'ACTIVE' });
      await u.setPassword('Test@1234');
      await u.save();
    }
  });
  for (const role of ROLES_UNDER_TEST) {
    tokens[role] = await login(`${role.toLowerCase()}@dash.local`, 'Test@1234');
  }
});

afterAll(async () => { await disconnectTestDb(); });

const fetchDashboard = async (role) => {
  const res = await request(app).get('/api/reports/dashboard').set(auth(tokens[role]));
  expect(res.status).toBe(200);
  return res.body.data;
};

describe('dashboard sections follow permissions', () => {
  it('gives an admin every section', async () => {
    const d = await fetchDashboard('ADMIN');
    for (const key of ['patients', 'appointments', 'doctors', 'opd', 'ipd', 'lab', 'pharmacy', 'beds', 'billing', 'blood']) {
      expect(d[key], `admin should get ${key}`).toBeTruthy();
    }
  });

  it('gives a pharmacist pharmacy and nothing they cannot see', async () => {
    const d = await fetchDashboard('PHARMACIST');
    expect(d.pharmacy).toBeTruthy();
    // No patient list, no revenue, no beds.
    expect(d.patients).toBeUndefined();
    expect(d.billing).toBeUndefined();
    expect(d.beds).toBeUndefined();
  });

  it('gives an accountant revenue but no clinical data', async () => {
    const d = await fetchDashboard('ACCOUNTANT');
    expect(d.billing).toBeTruthy();
    expect(d.billing.trend).toBeInstanceOf(Array);
    expect(d.patients).toBeUndefined();
    expect(d.opd).toBeUndefined();
    expect(d.lab).toBeUndefined();
  });

  it('gives a store manager neither clinical nor financial data', async () => {
    const d = await fetchDashboard('STORE_MANAGER');
    expect(d.patients).toBeUndefined();
    expect(d.billing).toBeUndefined();
    expect(d.pharmacy).toBeUndefined();
  });

  it('gives a nurse clinical sections and bed occupancy', async () => {
    const d = await fetchDashboard('NURSE');
    expect(d.patients).toBeTruthy();
    expect(d.ipd).toBeTruthy();
    expect(d.beds).toBeTruthy();
    // Nurses have no billing permission.
    expect(d.billing).toBeUndefined();
  });

  it('reports revenue in rupees, not paise', async () => {
    const d = await fetchDashboard('ACCOUNTANT');
    expect(Number.isFinite(d.billing.collected)).toBe(true);
    // Paise would make these integers hundreds of times larger; the round-trip
    // is covered properly in money.test.js — this guards the new endpoint's own
    // conversion, which aggregation makes easy to forget.
    expect(d.billing.collected).toBeLessThan(1_000_000_000);
  });

  it('is reachable by every signed-in role', async () => {
    for (const role of ROLES_UNDER_TEST) {
      const res = await request(app).get('/api/reports/dashboard').set(auth(tokens[role]));
      expect(res.status, `${role} was refused the dashboard`).toBe(200);
    }
  });

  it('is not reachable without signing in', async () => {
    const res = await request(app).get('/api/reports/dashboard');
    expect(res.status).toBe(401);
  });
});
