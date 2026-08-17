// Insurance settlement must move money through the same guarded path as every
// other payment. Settling used to adjust invoice.paidAmount by hand, which
// bypassed the overpayment rule and the paid/due/status recalculation.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb, inTenant } from './helpers.js';

const { InsuranceClaim } = await import('../src/models/InsuranceClaim.js');
const { Invoice } = await import('../src/models/Invoice.js');
const { Payment } = await import('../src/models/Payment.js');
const { Patient } = await import('../src/models/Patient.js');
const insurance = await import('../src/services/insuranceService.js');
const billing = await import('../src/services/billingService.js');

let patient;
let invoice;

beforeAll(async () => { await connectTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

beforeEach(async () => {
  await inTenant(async () => {
    await Promise.all([
      InsuranceClaim.deleteMany({}), Invoice.deleteMany({}),
      Payment.deleteMany({}), Patient.deleteMany({}),
    ]);
    await Payment.syncIndexes();

    patient = await Patient.create({
      firstName: 'Asha', lastName: 'Rao', gender: 'FEMALE', dateOfBirth: '1990-01-01', phone: '9000000040',
    });
    invoice = await billing.createInvoice({
      patient: patient._id,
      items: [{ description: 'Surgery', quantity: 1, unitPrice: 50000 }],
    }, null);
  });
});

// Walk a claim through to APPROVED, ready to settle.
async function approvedClaim(claimAmount, approvedAmount) {
  const claim = await insurance.createClaim({
    patient: patient._id, invoice: invoice._id,
    insuranceCompany: 'Star Health', policyNumber: 'POL-1', claimAmount,
  }, null);
  await insurance.changeStatus(claim._id, { status: 'SUBMITTED' }, null);
  await insurance.changeStatus(claim._id, { status: 'UNDER_REVIEW' }, null);
  await insurance.changeStatus(claim._id, { status: 'APPROVED', approvedAmount }, null);
  return claim;
}

describe('insurance settlement', () => {
  it('posts the approved amount against the invoice', () => inTenant(async () => {
    const claim = await approvedClaim(50000, 40000);
    await insurance.changeStatus(claim._id, { status: 'SETTLED' }, null);

    const after = await Invoice.findById(invoice._id);
    expect(after.paidAmount).toBe(40000);
    expect(after.dueAmount).toBe(10000);
    expect(after.status).toBe('PARTIAL');

    const payment = await Payment.findOne({ invoice: invoice._id });
    expect(payment.method).toBe('INSURANCE');
    expect(payment.transactionId).toBe(claim.claimNo);
  }));

  it('never pays past the invoice total when a cash payment got there first', () => inTenant(async () => {
    const claim = await approvedClaim(50000, 50000);
    // The patient paid ₹45,000 out of pocket while the claim was in review.
    await billing.recordPayment(invoice._id, { amount: 45000, method: 'CASH' }, null);

    await insurance.changeStatus(claim._id, { status: 'SETTLED' }, null);

    const after = await Invoice.findById(invoice._id);
    expect(after.paidAmount).toBe(50000); // capped at the total, not 95000
    expect(after.dueAmount).toBe(0);
    expect(after.status).toBe('PAID');
  }));

  it('settles once when two clerks settle the same claim together', () => inTenant(async () => {
    const claim = await approvedClaim(50000, 30000);

    const results = await Promise.allSettled([
      insurance.changeStatus(claim._id, { status: 'SETTLED' }, null),
      insurance.changeStatus(claim._id, { status: 'SETTLED' }, null),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

    const after = await Invoice.findById(invoice._id);
    expect(after.paidAmount).toBe(30000); // not 60000
    expect(await Payment.countDocuments({ invoice: invoice._id })).toBe(1);
  }));

  it('leaves a cancelled invoice untouched', () => inTenant(async () => {
    const claim = await approvedClaim(50000, 40000);
    await billing.cancelInvoice(invoice._id, 'Raised in error');

    await insurance.changeStatus(claim._id, { status: 'SETTLED' }, null);

    const after = await Invoice.findById(invoice._id);
    expect(after.status).toBe('CANCELLED');
    expect(after.paidAmount).toBe(0);
    expect(await Payment.countDocuments({ invoice: invoice._id })).toBe(0);
  }));

  it('rejects a transition the workflow does not allow', () => inTenant(async () => {
    const claim = await insurance.createClaim({
      patient: patient._id, invoice: invoice._id,
      insuranceCompany: 'Star Health', policyNumber: 'POL-1', claimAmount: 1000,
    }, null);

    // DRAFT cannot jump straight to SETTLED.
    await expect(insurance.changeStatus(claim._id, { status: 'SETTLED' }, null))
      .rejects.toMatchObject({ errorCode: 'INVALID_STATUS_TRANSITION' });
  }));
});
