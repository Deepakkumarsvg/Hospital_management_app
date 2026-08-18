// Money is stored as integer paise and spoken as rupees on the wire.
//
// The service-level tests elsewhere construct invoices directly, which means
// they are unit-agnostic: they would pass whether the numbers meant rupees or
// paise. These go through the real HTTP boundary — validators in, toJSON out —
// so they actually pin down which unit lives where, and they assert on the
// stored documents to prove the conversion happened rather than being skipped.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, connectTestDb, disconnectTestDb, seedBase, login, auth, inTenant } from './helpers.js';
import { toPaise, toRupees } from '../src/utils/money.js';

const { Invoice } = await import('../src/models/Invoice.js');
const { Payment } = await import('../src/models/Payment.js');
const { Patient } = await import('../src/models/Patient.js');

let token;
let patientId;

beforeAll(async () => {
  await connectTestDb();
  await seedBase();
  token = await login('admin@test.local', 'Admin@123');
  await inTenant(async () => {
    const p = await Patient.create({
      firstName: 'Money', lastName: 'Test', gender: 'OTHER', dateOfBirth: '1991-01-01', phone: '9000000099',
    });
    patientId = String(p._id);
  });
});

afterAll(async () => { await disconnectTestDb(); });

const post = (url, body) => request(app).post(url).set(auth(token)).send(body);

describe('toPaise / toRupees', () => {
  it('converts a value that floating point cannot hold exactly', () => {
    // 19.99 * 100 is 1998.9999999999998 in IEEE-754 — truncating would lose a paisa.
    expect(toPaise(19.99)).toBe(1999);
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(toPaise('1234.56')).toBe(123456);
  });

  it('round-trips a rupee value unchanged', () => {
    for (const r of [0, 0.01, 1, 19.99, 1234.56, 99999.95]) {
      expect(toRupees(toPaise(r))).toBe(r);
    }
  });

  it('treats missing and unparseable values as zero', () => {
    expect(toPaise(null)).toBe(0);
    expect(toPaise(undefined)).toBe(0);
    expect(toPaise('')).toBe(0);
    expect(toPaise('abc')).toBe(0);
  });
});

describe('invoice money crosses the HTTP boundary in rupees', () => {
  it('accepts rupees, stores paise, and returns rupees', async () => {
    const res = await post('/api/billing/invoices', {
      patient: patientId,
      items: [{ description: 'Consultation', quantity: 1, unitPrice: 19.99 }],
      discount: 0,
      taxPercent: 0,
    });
    expect(res.status).toBe(201);

    // Out on the wire: rupees, exactly as sent.
    expect(res.body.data.grandTotal).toBe(19.99);
    expect(res.body.data.items[0].unitPrice).toBe(19.99);

    // In the database: whole paise, no fraction anywhere.
    await inTenant(async () => {
      const stored = await Invoice.findById(res.body.data.id || res.body.data._id);
      expect(stored.grandTotal).toBe(1999);
      expect(stored.items[0].unitPrice).toBe(1999);
      expect(Number.isInteger(stored.grandTotal)).toBe(true);
    });
  });

  it('adds up amounts that would drift as floats', async () => {
    // 0.1 + 0.2 !== 0.3. Three such lines is the classic case where a
    // float-backed ledger ends up a paisa short of its own total.
    const res = await post('/api/billing/invoices', {
      patient: patientId,
      items: [
        { description: 'A', quantity: 1, unitPrice: 0.1 },
        { description: 'B', quantity: 1, unitPrice: 0.2 },
        { description: 'C', quantity: 3, unitPrice: 10.1 },
      ],
      taxPercent: 0,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.grandTotal).toBe(30.6); // 0.1 + 0.2 + 30.3

    await inTenant(async () => {
      const stored = await Invoice.findById(res.body.data.id || res.body.data._id);
      expect(stored.grandTotal).toBe(3060);
      expect(stored.subtotal).toBe(3060);
    });
  });

  it('settles to exactly zero due after paying the full amount', async () => {
    const created = await post('/api/billing/invoices', {
      patient: patientId,
      items: [{ description: 'Procedure', quantity: 3, unitPrice: 33.33 }],
      taxPercent: 18,
    });
    const id = created.body.data.id || created.body.data._id;
    const total = created.body.data.grandTotal; // rupees

    const paid = await post(`/api/billing/invoices/${id}/payments`, { amount: total, method: 'CASH' });
    expect(paid.status).toBe(201);

    // The whole point: paying the stated total leaves nothing behind. Under
    // float arithmetic this is where a stray fraction of a paisa would keep
    // the invoice stuck on PARTIAL forever.
    expect(paid.body.data.invoice.dueAmount).toBe(0);
    expect(paid.body.data.invoice.status).toBe('PAID');

    await inTenant(async () => {
      const stored = await Invoice.findById(id);
      expect(stored.dueAmount).toBe(0);
      expect(stored.paidAmount).toBe(stored.grandTotal);
    });
  });

  it('rejects an overpayment by a single paisa', async () => {
    const created = await post('/api/billing/invoices', {
      patient: patientId,
      items: [{ description: 'Test', quantity: 1, unitPrice: 100 }],
      taxPercent: 0,
    });
    const id = created.body.data.id || created.body.data._id;

    const over = await post(`/api/billing/invoices/${id}/payments`, { amount: 100.01, method: 'CASH' });
    expect(over.status).toBe(400);
    expect(over.body.error).toBe('OVERPAYMENT');

    // And exactly the total still goes through.
    const exact = await post(`/api/billing/invoices/${id}/payments`, { amount: 100, method: 'CASH' });
    expect(exact.status).toBe(201);
  });

  it('records a payment receipt in rupees on the wire and paise in the database', async () => {
    const created = await post('/api/billing/invoices', {
      patient: patientId,
      items: [{ description: 'X-Ray', quantity: 1, unitPrice: 450.5 }],
      taxPercent: 0,
    });
    const id = created.body.data.id || created.body.data._id;

    const paid = await post(`/api/billing/invoices/${id}/payments`, { amount: 200.25, method: 'CARD' });
    expect(paid.body.data.payment.amount).toBe(200.25);
    expect(paid.body.data.invoice.dueAmount).toBe(250.25);

    await inTenant(async () => {
      const stored = await Payment.findById(paid.body.data.payment.id || paid.body.data.payment._id);
      expect(stored.amount).toBe(20025);
    });
  });
});

describe('reported totals come back in rupees', () => {
  it('reports billing stats in rupees, not paise', async () => {
    const res = await request(app).get('/api/billing/stats').set(auth(token));
    expect(res.status).toBe(200);

    // Cross-check against the ledger: the stats endpoint reads through an
    // aggregation, which bypasses the schema transform and so has to convert
    // by hand — the one place this is easy to get wrong.
    const ledger = await inTenant(async () => {
      const rows = await Invoice.aggregate([
        { $match: { status: { $nin: ['CANCELLED'] } } },
        { $group: { _id: null, billed: { $sum: '$grandTotal' } } },
      ]);
      return rows[0]?.billed || 0;
    });

    expect(res.body.data.billed).toBe(toRupees(ledger));
    expect(res.body.data.billed).toBeLessThan(ledger); // i.e. it really was divided
  });
});
