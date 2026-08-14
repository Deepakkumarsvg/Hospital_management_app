import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, connectTestDb, disconnectTestDb, seedBase, login, auth } from './helpers.js';

let adminToken;
let recepToken;

beforeAll(async () => {
  await connectTestDb();
  await seedBase();
  adminToken = await login('admin@test.local', 'Admin@123');
  recepToken = await login('recep@test.local', 'Recep@123');
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('Auth', () => {
  it('logs in with valid credentials and returns a token', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@test.local', password: 'Admin@123' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.role).toBe('SUPER_ADMIN');
  });

  it('rejects a wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@test.local', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns the current user for GET /auth/me', async () => {
    const res = await request(app).get('/api/auth/me').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('admin@test.local');
  });

  it('rejects unauthenticated access to a protected route', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('RBAC', () => {
  it('allows an admin to list users', async () => {
    const res = await request(app).get('/api/users').set(auth(adminToken));
    expect(res.status).toBe(200);
  });

  it('forbids a receptionist from listing users', async () => {
    const res = await request(app).get('/api/users').set(auth(recepToken));
    expect(res.status).toBe(403);
  });
});

describe('Patients', () => {
  it('creates a patient and auto-generates a UHID', async () => {
    const res = await request(app).post('/api/patients').set(auth(adminToken)).send({
      firstName: 'Test', lastName: 'Patient', gender: 'MALE',
      dateOfBirth: '1990-01-01', phone: '9998887777',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.uhid).toMatch(/^HMS-\d{4}-\d{6}$/);
  });

  it('rejects an invalid patient (missing required fields)', async () => {
    const res = await request(app).post('/api/patients').set(auth(adminToken)).send({ firstName: 'NoGender' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('lists patients including the one just created', async () => {
    const res = await request(app).get('/api/patients').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Settings', () => {
  it('returns hospital settings (creating defaults on first read)', async () => {
    const res = await request(app).get('/api/settings').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.hospitalName).toBeTruthy();
  });

  it('lets an admin update settings', async () => {
    const res = await request(app).put('/api/settings').set(auth(adminToken)).send({ hospitalName: 'Test Hospital', defaultTaxPercent: 5 });
    expect(res.status).toBe(200);
    expect(res.body.data.hospitalName).toBe('Test Hospital');
    expect(res.body.data.defaultTaxPercent).toBe(5);
  });

  it('forbids a receptionist from updating settings', async () => {
    const res = await request(app).put('/api/settings').set(auth(recepToken)).send({ hospitalName: 'Hack' });
    expect(res.status).toBe(403);
  });
});
