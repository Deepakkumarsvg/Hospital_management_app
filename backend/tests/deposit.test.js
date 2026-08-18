// Advances taken before the bill exists.
//
// The invariant the whole module rests on:
//
//     amount = applied + refunded + available
//
// It must hold after every operation, and `available` must never go negative —
// because whatever is left at discharge is the patient's money, and a system
// that loses track of it is a system that quietly keeps it.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb, inTenant } from './helpers.js';
import { toPaise as rs } from '../src/utils/money.js';

const { Deposit } = await import('../src/models/Deposit.js');
const { Patient } = await import('../src/models/Patient.js');
const { Invoice } = await import('../src/models/Invoice.js');
const { Payment } = await import('../src/models/Payment.js');
const deposits = await import('../src/services/depositService.js');
const billing = await import('../src/services/billingService.js');

let patient; let other;

beforeAll(async () => { await connectTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

beforeEach(async () => {
  await inTenant(async () => {
    await Promise.all([
      Deposit.deleteMany({}), Patient.deleteMany({}), Invoice.deleteMany({}), Payment.deleteMany({}),
    ]);
    await Payment.syncIndexes();

    [patient, other] = await Patient.create([
      { firstName: 'Deep', lastName: 'Sharma', gender: 'MALE', dateOfBirth: '1975-02-02', phone: '9000000141' },
      { firstName: 'Other', lastName: 'Person', gender: 'FEMALE', dateOfBirth: '1980-03-03', phone: '9000000142' },
    ]);
  });
});

const collect = (rupees = 50000) =>
  deposits.collect({ patient: patient._id, amount: rs(rupees), method: 'CASH' }, null);

const invoiceFor = (who, rupees) => billing.createInvoice({
  patient: who._id,
  items: [{ description: 'Treatment', quantity: 1, unitPrice: rs(rupees) }],
}, null);

// The invariant, checked directly against the stored document.
async function assertBalances(id) {
  const d = await Deposit.findById(id);
  expect(d.amount).toBe(d.applied + d.refunded + d.available);
  expect(d.available).toBeGreaterThanOrEqual(0);
  return d;
}

describe('collecting an advance', () => {
  it('records the full amount as available', () => inTenant(async () => {
    const d = await collect(50000);
    expect(d.amount).toBe(rs(50000));
    expect(d.available).toBe(rs(50000));
    expect(d.movements).toHaveLength(1);
    expect(d.movements[0].type).toBe('COLLECTED');
  }));

  it('adds a top-up to the same running balance', () => inTenant(async () => {
    // One balance per admission is what the family is actually told at the
    // counter, so a second payment tops it up rather than starting a new one.
    const d = await collect(30000);
    const after = await deposits.topUp(d._id, { amount: rs(20000), method: 'UPI' }, null);

    expect(after.amount).toBe(rs(50000));
    expect(after.available).toBe(rs(50000));
    await assertBalances(d._id);
  }));

  it('returns rupees on the wire while storing paise', () => inTenant(async () => {
    const d = await collect(50000);
    expect(d.toJSON().amount).toBe(50000);
    expect(d.amount).toBe(rs(50000));
  }));
});

describe('applying it to a bill', () => {
  it('pays the invoice and draws the balance down', () => inTenant(async () => {
    const d = await collect(50000);
    const inv = await invoiceFor(patient, 20000);

    const after = await deposits.applyToInvoice(d._id, inv._id, rs(20000), null);

    expect(after.applied).toBe(rs(20000));
    expect(after.available).toBe(rs(30000));
    expect((await Invoice.findById(inv._id)).status).toBe('PAID');
    await assertBalances(d._id);
  }));

  it('never applies more than is owed', () => inTenant(async () => {
    const d = await collect(50000);
    const inv = await invoiceFor(patient, 8000);

    // Asked for the lot; only the due amount can actually go.
    const after = await deposits.applyToInvoice(d._id, inv._id, rs(50000), null);
    expect(after.applied).toBe(rs(8000));
    expect(after.available).toBe(rs(42000));
  }));

  it('never applies more than is held', () => inTenant(async () => {
    const d = await collect(5000);
    const inv = await invoiceFor(patient, 20000);

    const after = await deposits.applyToInvoice(d._id, inv._id, rs(20000), null);
    expect(after.applied).toBe(rs(5000));
    expect(after.available).toBe(0);
    expect((await Invoice.findById(inv._id)).dueAmount).toBe(rs(15000));
  }));

  it('applies as much as fits when no amount is named', () => inTenant(async () => {
    const d = await collect(10000);
    const inv = await invoiceFor(patient, 4000);

    const after = await deposits.applyToInvoice(d._id, inv._id, null, null);
    expect(after.applied).toBe(rs(4000));
  }));

  it('never lets the same advance be spent twice', () => inTenant(async () => {
    // Two clerks, two invoices, one advance. The available-balance rule lives
    // in the query, so the second cannot spend money the first already used.
    const d = await collect(10000);
    const [a, b] = await Promise.all([invoiceFor(patient, 10000), invoiceFor(patient, 10000)]);

    const results = await Promise.allSettled([
      deposits.applyToInvoice(d._id, a._id, rs(10000), null),
      deposits.applyToInvoice(d._id, b._id, rs(10000), null),
    ]);

    const applied = (await Deposit.findById(d._id)).applied;
    expect(applied).toBe(rs(10000)); // not 20000
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
    await assertBalances(d._id);
  }));

  it('refuses to spend one patient advance on another patient bill', () => inTenant(async () => {
    const d = await collect(10000);
    const theirs = await invoiceFor(other, 5000);

    await expect(deposits.applyToInvoice(d._id, theirs._id, rs(5000), null))
      .rejects.toMatchObject({ errorCode: 'DEPOSIT_PATIENT_MISMATCH' });
  }));

  it('refuses a cancelled invoice', () => inTenant(async () => {
    const d = await collect(10000);
    const inv = await invoiceFor(patient, 5000);
    await billing.cancelInvoice(inv._id, 'Raised in error');

    await expect(deposits.applyToInvoice(d._id, inv._id, rs(5000), null))
      .rejects.toMatchObject({ errorCode: 'INVOICE_LOCKED' });
  }));

  it('says so when the advance is spent', () => inTenant(async () => {
    const d = await collect(5000);
    const first = await invoiceFor(patient, 5000);
    await deposits.applyToInvoice(d._id, first._id, rs(5000), null);

    const second = await invoiceFor(patient, 1000);
    await expect(deposits.applyToInvoice(d._id, second._id, rs(1000), null))
      .rejects.toMatchObject({ errorCode: 'DEPOSIT_EXHAUSTED' });
  }));
});

describe('giving it back', () => {
  it('refunds the unused balance', () => inTenant(async () => {
    const d = await collect(50000);
    const inv = await invoiceFor(patient, 30000);
    await deposits.applyToInvoice(d._id, inv._id, rs(30000), null);

    const after = await deposits.refund(d._id, null, null, 'Discharge settlement');
    expect(after.refunded).toBe(rs(20000));
    expect(after.available).toBe(0);
    expect(after.status).toBe('EXHAUSTED');
    await assertBalances(d._id);
  }));

  it('refunds part of it', () => inTenant(async () => {
    const d = await collect(50000);
    const after = await deposits.refund(d._id, rs(15000), null, '');
    expect(after.refunded).toBe(rs(15000));
    expect(after.available).toBe(rs(35000));
  }));

  it('never refunds more than is held', () => inTenant(async () => {
    const d = await collect(10000);
    await expect(deposits.refund(d._id, rs(15000), null, ''))
      .rejects.toMatchObject({ errorCode: 'DEPOSIT_REFUND_EXCEEDS' });
  }));

  it('never lets two refunds draw on the same balance', () => inTenant(async () => {
    const d = await collect(10000);
    const results = await Promise.allSettled([
      deposits.refund(d._id, rs(10000), null, ''),
      deposits.refund(d._id, rs(10000), null, ''),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await Deposit.findById(d._id)).refunded).toBe(rs(10000));
    await assertBalances(d._id);
  }));
});

describe('closing at discharge', () => {
  it('refuses while money is still held', () => inTenant(async () => {
    // An advance with a balance left is the patient's money. Closing the record
    // would be the system quietly keeping it.
    const d = await collect(50000);
    await expect(deposits.close(d._id, null))
      .rejects.toMatchObject({ errorCode: 'DEPOSIT_HAS_BALANCE' });
  }));

  it('closes once the balance is nil', () => inTenant(async () => {
    const d = await collect(50000);
    const inv = await invoiceFor(patient, 30000);
    await deposits.applyToInvoice(d._id, inv._id, rs(30000), null);
    await deposits.refund(d._id, null, null, 'Balance returned');

    const closed = await deposits.close(d._id, null);
    expect(closed.status).toBe('CLOSED');
    expect(closed.closedAt).toBeTruthy();
  }));

  it('refuses a top-up on a closed deposit', () => inTenant(async () => {
    const d = await collect(1000);
    await deposits.refund(d._id, null, null, '');
    await deposits.close(d._id, null);

    await expect(deposits.topUp(d._id, { amount: rs(500) }, null))
      .rejects.toMatchObject({ errorCode: 'DEPOSIT_CLOSED' });
  }));
});

describe('what the counter reads out', () => {
  it('adds up every open advance for a patient', () => inTenant(async () => {
    await collect(30000);
    await collect(20000);

    const { available, deposits: rows } = await deposits.balanceFor(patient._id);
    expect(available).toBe(50000); // rupees on the wire
    expect(rows).toHaveLength(2);
  }));

  it('leaves closed advances out of the balance', () => inTenant(async () => {
    const d = await collect(10000);
    await deposits.refund(d._id, null, null, '');
    await deposits.close(d._id, null);
    await collect(5000);

    expect((await deposits.balanceFor(patient._id)).available).toBe(5000);
  }));
});
