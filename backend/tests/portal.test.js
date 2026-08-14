import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, connectTestDb, disconnectTestDb, seedBase, login, auth, inTenant } from './helpers.js';

const { Department } = await import('../src/models/Department.js');
const { Doctor } = await import('../src/models/Doctor.js');
const { Invoice } = await import('../src/models/Invoice.js');

let patientToken;
let adminToken;
let doctorId;
let patientId;

beforeAll(async () => {
  await connectTestDb();
  await seedBase();
  adminToken = await login('admin@test.local', 'Admin@123');

  doctorId = await inTenant(async () => {
    const dept = await Department.create({ name: 'General', code: 'GEN' });
    const doc = await Doctor.create({
      firstName: 'Test', lastName: 'Doc', registrationNo: 'REG-1', specialization: 'GP',
      department: dept._id, phone: '9999999999', consultationFee: 300, status: 'ACTIVE',
    });
    return String(doc._id);
  });

  // Register a patient via the portal.
  const res = await request(app).post('/api/portal/register').send({
    firstName: 'Portal', lastName: 'User', gender: 'MALE',
    dateOfBirth: '1990-01-01', phone: '9800000000', email: 'pt@test.local', password: 'Pt@1234',
  });
  patientToken = res.body.data.token;
  patientId = res.body.data.patient.id;
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('Portal auth', () => {
  it('registers a patient with a PATIENT account and UHID', async () => {
    const me = await request(app).get('/api/portal/me').set(auth(patientToken));
    expect(me.status).toBe(200);
    expect(me.body.data.uhid).toMatch(/^HMS-\d{4}-\d{6}$/);
  });

  it('forbids an admin from the patient portal', async () => {
    const res = await request(app).get('/api/portal/me').set(auth(adminToken));
    expect(res.status).toBe(403);
  });

  it('forbids a patient from staff endpoints', async () => {
    const res = await request(app).get('/api/users').set(auth(patientToken));
    expect(res.status).toBe(403);
  });
});

describe('Portal appointments (incl. teleconsult)', () => {
  it('books a teleconsult appointment with a generated meeting room', async () => {
    const res = await request(app).post('/api/portal/appointments').set(auth(patientToken)).send({
      doctor: doctorId, date: '2027-01-01', time: '10:00', reason: 'Checkup', teleconsult: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.teleconsult).toBe(true);
    expect(res.body.data.meetingRoom).toMatch(/^HMS-APT-/);
  });
});

describe('Portal online payment (mock gateway)', () => {
  it('pays an invoice fully via the mock gateway', async () => {
    const inv = await inTenant(async () => {
      const i = new Invoice({ patient: patientId, items: [{ description: 'Consult', quantity: 1, unitPrice: 500 }] });
      i.recompute();
      await i.save();
      return i;
    });

    const order = await request(app).post(`/api/portal/invoices/${inv._id}/pay/order`).set(auth(patientToken));
    expect(order.status).toBe(200);
    expect(order.body.data.mode).toBe('mock');

    const verify = await request(app).post(`/api/portal/invoices/${inv._id}/pay/verify`).set(auth(patientToken))
      .send({ orderId: order.body.data.orderId, paymentId: 'pay_test' });
    expect(verify.status).toBe(200);
    expect(verify.body.data.invoice.status).toBe('PAID');
    expect(verify.body.data.invoice.dueAmount).toBe(0);
  });

  it("rejects paying another patient's invoice", async () => {
    const otherInv = await inTenant(async () => {
      const i = new Invoice({ patient: '000000000000000000000000', items: [{ description: 'X', quantity: 1, unitPrice: 100 }] });
      i.recompute();
      await i.save();
      return i;
    });
    const res = await request(app).post(`/api/portal/invoices/${otherInv._id}/pay/order`).set(auth(patientToken));
    expect(res.status).toBe(403);
  });
});
