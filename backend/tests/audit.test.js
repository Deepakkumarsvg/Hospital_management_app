// The audit trail has to answer two questions after the fact: who changed this,
// and who *looked* at it.
//
// Before this, roughly half the controllers wrote no audit entry at all and
// nothing recorded reads — so "which member of staff opened this patient's
// chart" had no answer anywhere in the system. Auditing is now attached to the
// router rather than remembered per controller, which is what these tests pin
// down: a route is audited because it exists.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, connectTestDb, disconnectTestDb, inTenant, seedBase, login, auth } from './helpers.js';

const { AuditLog } = await import('../src/models/AuditLog.js');
const { Patient } = await import('../src/models/Patient.js');

let token;
let patient;

beforeAll(async () => {
  await connectTestDb();
  await seedBase();
  token = await login('admin@test.local', 'Admin@123');
});

afterAll(async () => { await disconnectTestDb(); });

beforeEach(async () => {
  await inTenant(async () => {
    // AuditLog refuses deleteMany by design, so clear it through the driver.
    await AuditLog.collection.deleteMany({});
    await Patient.deleteMany({});
    patient = await Patient.create({
      firstName: 'Audit', lastName: 'Subject', gender: 'FEMALE',
      dateOfBirth: '1985-03-12', phone: '9000000061',
    });
  });
});

// Audit writes are fire-and-forget on res.finish, so give them a moment.
const entries = async (filter = {}) => {
  await new Promise((r) => setTimeout(r, 120));
  return inTenant(() => AuditLog.find(filter).sort({ createdAt: 1 }).lean());
};

describe('PHI read logging', () => {
  it('records who opened a patient record', async () => {
    const res = await request(app).get(`/api/patients/${patient._id}`).set(auth(token));
    expect(res.status).toBe(200);

    const rows = await entries({ module: 'Patient', action: 'READ' });
    expect(rows).toHaveLength(1);
    expect(rows[0].recordId).toBe(String(patient._id));
    expect(rows[0].userName).toBe('Admin');
    expect(rows[0].userRole).toBe('SUPER_ADMIN');
  });

  it('records a patient list being pulled', async () => {
    await request(app).get('/api/patients').set(auth(token));
    const rows = await entries({ module: 'Patient', action: 'READ' });
    expect(rows).toHaveLength(1);
  });

  it('does not log reads of non-clinical reference data', async () => {
    await request(app).get('/api/departments').set(auth(token));
    expect(await entries({ module: 'Department', action: 'READ' })).toHaveLength(0);
  });

  it('does not log a read that was refused', async () => {
    const res = await request(app).get(`/api/patients/${patient._id}`); // no token
    expect(res.status).toBe(401);
    expect(await entries({ action: 'READ' })).toHaveLength(0);
  });
});

describe('mutation logging', () => {
  it('records a create on a module whose controller never called audit()', async () => {
    // Wards had no audit call anywhere; the router-level trail covers it now.
    const res = await request(app).post('/api/wards').set(auth(token))
      .send({ name: 'Audit Ward', code: 'AW', type: 'GENERAL' });
    expect(res.status).toBe(201);

    const rows = await entries({ module: 'Facility', action: 'CREATE' });
    expect(rows).toHaveLength(1);
  });

  it('records an update with a safe summary of what was sent', async () => {
    const created = await request(app).post('/api/wards').set(auth(token))
      .send({ name: 'Meta Ward', code: 'MW', type: 'GENERAL' });
    const wardId = created.body.data.id || created.body.data._id;

    const res = await request(app).put(`/api/wards/${wardId}`).set(auth(token))
      .send({ name: 'Renamed Ward' });
    expect(res.status).toBe(200);

    const rows = await entries({ module: 'Facility', action: 'UPDATE' });
    expect(rows).toHaveLength(1);
    expect(rows[0].recordId).toBe(String(wardId));
    expect(rows[0].meta.name).toBe('Renamed Ward');
  });

  it('records a patient update even though its controller writes its own entry', async () => {
    const res = await request(app).put(`/api/patients/${patient._id}`).set(auth(token))
      .send({ firstName: 'Renamed', allergies: 'Penicillin' });
    expect(res.status).toBe(200);

    // patientController describes the change itself, so there is exactly one
    // entry and it is that richer one — no meta blob, but a real description.
    const rows = await entries({ module: 'Patient', action: 'UPDATE' });
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBeTruthy();
  });

  it('never records a password, even when one is in the body', async () => {
    await request(app).post('/api/users').set(auth(token)).send({
      name: 'New Staff', email: 'newstaff@test.local', role: 'NURSE', password: 'Secret@1234',
    });

    const rows = await entries({ module: 'User' });
    const serialised = JSON.stringify(rows);
    expect(serialised).not.toContain('Secret@1234');
    for (const row of rows) {
      expect(row.meta?.password).toBeUndefined();
    }
  });

  it('does not record a mutation that failed validation', async () => {
    const res = await request(app).post('/api/wards').set(auth(token)).send({});
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await entries({ module: 'Facility', action: 'CREATE' })).toHaveLength(0);
  });

  it('writes one entry, not two, when the controller also describes the action', async () => {
    // patientController calls audit() itself with a richer description; the
    // router-level trail must stand aside rather than double-logging.
    const res = await request(app).post('/api/patients').set(auth(token)).send({
      firstName: 'Second', lastName: 'Patient', gender: 'MALE',
      dateOfBirth: '1990-01-01', phone: '9000000062',
    });
    expect(res.status).toBe(201);

    const rows = await entries({ module: 'Patient', action: 'CREATE' });
    expect(rows).toHaveLength(1);
  });

  it('ties an entry back to its request id', async () => {
    await request(app).get(`/api/patients/${patient._id}`)
      .set(auth(token)).set('X-Request-Id', 'trace-me-123');

    const rows = await entries({ action: 'READ' });
    expect(rows[0].requestId).toBe('trace-me-123');
  });
});

describe('append-only enforcement', () => {
  it('refuses to modify an entry', () => inTenant(async () => {
    const row = await AuditLog.create({ action: 'READ', module: 'Patient', description: 'original' });

    await expect(AuditLog.updateOne({ _id: row._id }, { description: 'tampered' }))
      .rejects.toThrow(/append-only/);
    await expect(AuditLog.findOneAndUpdate({ _id: row._id }, { description: 'tampered' }))
      .rejects.toThrow(/append-only/);

    const after = await AuditLog.findById(row._id);
    expect(after.description).toBe('original');
  }));

  it('refuses to re-save an existing entry', () => inTenant(async () => {
    const row = await AuditLog.create({ action: 'READ', module: 'Patient', description: 'original' });
    row.description = 'tampered';
    await expect(row.save()).rejects.toThrow(/append-only/);
  }));

  it('refuses to delete an entry', () => inTenant(async () => {
    const row = await AuditLog.create({ action: 'READ', module: 'Patient' });

    await expect(AuditLog.deleteOne({ _id: row._id })).rejects.toThrow(/append-only/);
    await expect(AuditLog.deleteMany({})).rejects.toThrow(/append-only/);

    expect(await AuditLog.findById(row._id)).toBeTruthy();
  }));

  it('still allows new entries to be appended', () => inTenant(async () => {
    await AuditLog.create({ action: 'CREATE', module: 'Patient' });
    await AuditLog.create({ action: 'UPDATE', module: 'Patient' });
    expect(await AuditLog.countDocuments({})).toBe(2);
  }));
});
