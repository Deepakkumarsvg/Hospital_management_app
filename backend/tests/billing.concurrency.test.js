// Money-integrity guarantees on invoices.
//
// The invariant: paidAmount must equal the sum of recorded payments minus
// refunds, must never exceed grandTotal, and dueAmount/status must always
// agree with it — including when payments, refunds and cancellations overlap.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb, inTenant } from './helpers.js';
// These call the services directly, below the HTTP boundary, so amounts are
// written in the unit the models store: paise. See tests/money.test.js for the
// rupees-in/rupees-out contract itself.
import { toPaise as rs } from '../src/utils/money.js';

const { Invoice } = await import('../src/models/Invoice.js');
const { Payment } = await import('../src/models/Payment.js');
const { Patient } = await import('../src/models/Patient.js');
const billing = await import('../src/services/billingService.js');

let patient;

beforeAll(async () => { await connectTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

beforeEach(async () => {
  await inTenant(async () => {
    await Promise.all([Invoice.deleteMany({}), Payment.deleteMany({}), Patient.deleteMany({})]);
    // The gateway-idempotency test relies on the unique transactionId index.
    await Payment.syncIndexes();
    patient = await Patient.create({
      firstName: 'Asha', lastName: 'Rao', gender: 'FEMALE', dateOfBirth: '1990-01-01', phone: '9000000020',
    });
  });
});

// A ₹1000 invoice, no discount or tax, so the arithmetic stays obvious.
const newInvoice = () => billing.createInvoice({
  patient: patient._id,
  items: [{ description: 'Procedure', quantity: 1, unitPrice: rs(1000) }],
}, null);

// What the payment ledger says was actually collected.
async function ledgerBalance(invoiceId) {
  const rows = await Payment.find({ invoice: invoiceId });
  return rows.reduce((s, p) => s + (p.type === 'REFUND' ? -p.amount : p.amount), 0);
}

describe('invoice payment concurrency', () => {
  it('never lets concurrent payments exceed the grand total', () => inTenant(async () => {
    const inv = await newInvoice();

    // Three cashiers each try to take the full ₹1000 at the same moment.
    const results = await Promise.allSettled([1, 2, 3].map(() =>
      billing.recordPayment(inv._id, { amount: rs(1000), method: 'CASH' }, null)
    ));

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results.filter((r) => r.status === 'rejected')) {
      expect(r.reason.errorCode).toBe('OVERPAYMENT');
    }

    const after = await Invoice.findById(inv._id);
    expect(after.paidAmount).toBe(rs(1000));
    expect(after.dueAmount).toBe(0);
    expect(after.status).toBe('PAID');
    expect(await ledgerBalance(inv._id)).toBe(rs(1000)); // exactly one receipt
  }));

  it('adds up concurrent partial payments without losing any', () => inTenant(async () => {
    const inv = await newInvoice();

    // Four ₹250 payments land together — all fit, none may be lost.
    const results = await Promise.allSettled([1, 2, 3, 4].map(() =>
      billing.recordPayment(inv._id, { amount: rs(250), method: 'CASH' }, null)
    ));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(4);

    const after = await Invoice.findById(inv._id);
    expect(after.paidAmount).toBe(rs(1000));
    expect(after.status).toBe('PAID');
    expect(await ledgerBalance(inv._id)).toBe(rs(1000));
  }));

  it('keeps status and dueAmount consistent on a partial payment', () => inTenant(async () => {
    const inv = await newInvoice();
    const { invoice } = await billing.recordPayment(inv._id, { amount: rs(400), method: 'CARD' }, null);

    expect(invoice.paidAmount).toBe(rs(400));
    expect(invoice.dueAmount).toBe(rs(600));
    expect(invoice.status).toBe('PARTIAL');
  }));

  it('never refunds more than was actually paid', () => inTenant(async () => {
    const inv = await newInvoice();
    await billing.recordPayment(inv._id, { amount: rs(600), method: 'CASH' }, null);

    // Two clerks each try to refund the whole ₹600.
    const results = await Promise.allSettled([1, 2].map(() =>
      billing.refundInvoice(inv._id, { amount: rs(600), method: 'CASH', reason: 'Cancelled procedure' }, null)
    ));

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected').reason;
    expect(['REFUND_EXCEEDS_PAID', 'NOTHING_PAID']).toContain(rejected.errorCode);

    const after = await Invoice.findById(inv._id);
    expect(after.paidAmount).toBe(0);
    expect(after.status).toBe('REFUNDED');
    expect(await ledgerBalance(inv._id)).toBe(0);
  }));

  it('leaves a partial refund re-derivable as PARTIAL', () => inTenant(async () => {
    const inv = await newInvoice();
    await billing.recordPayment(inv._id, { amount: rs(1000), method: 'CASH' }, null);
    const { invoice } = await billing.refundInvoice(inv._id, { amount: rs(300), method: 'CASH' }, null);

    expect(invoice.paidAmount).toBe(rs(700));
    expect(invoice.dueAmount).toBe(rs(300));
    expect(invoice.status).toBe('PARTIAL');
    expect(await ledgerBalance(inv._id)).toBe(rs(700));
  }));

  it('refuses to cancel an invoice that a payment just landed on', () => inTenant(async () => {
    const inv = await newInvoice();

    const [pay, cancel] = await Promise.allSettled([
      billing.recordPayment(inv._id, { amount: rs(1000), method: 'CASH' }, null),
      billing.cancelInvoice(inv._id, 'Booked by mistake'),
    ]);

    // Whichever wins, the invoice must never be both cancelled and paid.
    const after = await Invoice.findById(inv._id);
    if (cancel.status === 'fulfilled') {
      expect(after.status).toBe('CANCELLED');
      expect(after.paidAmount).toBe(0);
      expect(pay.status).toBe('rejected');
    } else {
      expect(after.status).toBe('PAID');
      expect(after.paidAmount).toBe(rs(1000));
    }
    expect(await ledgerBalance(inv._id)).toBe(after.paidAmount);
  }));

  it('banks a gateway payment once even if verify and webhook both fire', () => inTenant(async () => {
    const inv = await newInvoice();
    const txn = 'pay_MOCK_ABC123';

    const results = await Promise.allSettled([
      billing.recordPayment(inv._id, { amount: rs(1000), method: 'ONLINE', transactionId: txn }, null),
      billing.recordPayment(inv._id, { amount: rs(1000), method: 'ONLINE', transactionId: txn }, null),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(['PAYMENT_ALREADY_RECORDED', 'OVERPAYMENT'])
      .toContain(results.find((r) => r.status === 'rejected').reason.errorCode);

    const after = await Invoice.findById(inv._id);
    expect(after.paidAmount).toBe(rs(1000));
    expect(await Payment.countDocuments({ transactionId: txn })).toBe(1);
  }));

  it('refuses to bank the same gateway transaction id twice', () => inTenant(async () => {
    const inv = await newInvoice();
    const txn = 'pay_MOCK_XYZ789';

    // Two ₹400 captures would both fit inside a ₹1000 invoice, so only the
    // transactionId can tell them apart — this isolates the dedup index from
    // the overpayment guard.
    await billing.recordPayment(inv._id, { amount: rs(400), method: 'ONLINE', transactionId: txn }, null);
    await expect(billing.recordPayment(inv._id, { amount: rs(400), method: 'ONLINE', transactionId: txn }, null))
      .rejects.toMatchObject({ errorCode: 'PAYMENT_ALREADY_RECORDED' });

    // The rejected attempt must not have left the invoice inflated.
    const after = await Invoice.findById(inv._id);
    expect(after.paidAmount).toBe(rs(400));
    expect(after.dueAmount).toBe(rs(600));
    expect(after.status).toBe('PARTIAL');
    expect(await ledgerBalance(inv._id)).toBe(rs(400));
  }));

  it('still allows several desk payments with no transaction id', () => inTenant(async () => {
    const inv = await newInvoice();
    await billing.recordPayment(inv._id, { amount: rs(300), method: 'CASH' }, null);
    await billing.recordPayment(inv._id, { amount: rs(300), method: 'CASH' }, null);

    expect((await Invoice.findById(inv._id)).paidAmount).toBe(rs(600));
    expect(await Payment.countDocuments({})).toBe(2);
  }));

  it('rejects payment on a cancelled invoice', () => inTenant(async () => {
    const inv = await newInvoice();
    await billing.cancelInvoice(inv._id, 'Duplicate');

    await expect(billing.recordPayment(inv._id, { amount: rs(100), method: 'CASH' }, null))
      .rejects.toMatchObject({ errorCode: 'INVOICE_LOCKED' });
  }));
});
