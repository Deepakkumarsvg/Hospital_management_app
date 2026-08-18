// Insurance settlement must move money through the same guarded path as every
// other payment. Settling used to adjust invoice.paidAmount by hand, which
// bypassed the overpayment rule and the paid/due/status recalculation.
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { connectTestDb, disconnectTestDb, inTenant } from './helpers.js';
// Services are called directly here, below the HTTP boundary, so amounts are
// written in the unit the models store: paise. See tests/money.test.js.
import { toPaise as rs } from '../src/utils/money.js';

// Settling calls into the billing service to bank the money. Most tests want
// the real thing; one needs it to fail the way a lost database write would, so
// the module is wrapped with a switch that is off unless a test turns it on.
const failNextPayment = { reason: null };
vi.mock('../src/services/billingService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    recordPayment: (...args) => {
      if (failNextPayment.reason) {
        const err = new Error(failNextPayment.reason);
        failNextPayment.reason = null;
        return Promise.reject(err);
      }
      return actual.recordPayment(...args);
    },
  };
});

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
      items: [{ description: 'Surgery', quantity: 1, unitPrice: rs(50000) }],
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
    const claim = await approvedClaim(rs(50000), rs(40000));
    await insurance.changeStatus(claim._id, { status: 'SETTLED' }, null);

    const after = await Invoice.findById(invoice._id);
    expect(after.paidAmount).toBe(rs(40000));
    expect(after.dueAmount).toBe(rs(10000));
    expect(after.status).toBe('PARTIAL');

    const payment = await Payment.findOne({ invoice: invoice._id });
    expect(payment.method).toBe('INSURANCE');
    expect(payment.transactionId).toBe(claim.claimNo);
  }));

  it('never pays past the invoice total when a cash payment got there first', () => inTenant(async () => {
    const claim = await approvedClaim(rs(50000), rs(50000));
    // The patient paid ₹45,000 out of pocket while the claim was in review.
    await billing.recordPayment(invoice._id, { amount: rs(45000), method: 'CASH' }, null);

    await insurance.changeStatus(claim._id, { status: 'SETTLED' }, null);

    const after = await Invoice.findById(invoice._id);
    expect(after.paidAmount).toBe(rs(50000)); // capped at the total, not 95000
    expect(after.dueAmount).toBe(0);
    expect(after.status).toBe('PAID');
  }));

  it('settles once when two clerks settle the same claim together', () => inTenant(async () => {
    const claim = await approvedClaim(rs(50000), rs(30000));

    const results = await Promise.allSettled([
      insurance.changeStatus(claim._id, { status: 'SETTLED' }, null),
      insurance.changeStatus(claim._id, { status: 'SETTLED' }, null),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

    const after = await Invoice.findById(invoice._id);
    expect(after.paidAmount).toBe(rs(30000)); // not 60000
    expect(await Payment.countDocuments({ invoice: invoice._id })).toBe(1);
  }));

  it('leaves a cancelled invoice untouched', () => inTenant(async () => {
    const claim = await approvedClaim(rs(50000), rs(40000));
    await billing.cancelInvoice(invoice._id, 'Raised in error');

    await insurance.changeStatus(claim._id, { status: 'SETTLED' }, null);

    const after = await Invoice.findById(invoice._id);
    expect(after.status).toBe('CANCELLED');
    expect(after.paidAmount).toBe(0);
    expect(await Payment.countDocuments({ invoice: invoice._id })).toBe(0);
  }));

  it('reverses the claim when the settlement payment cannot be banked', () => inTenant(async () => {
    const claim = await approvedClaim(rs(50000), rs(40000));
    failNextPayment.reason = 'connection reset while writing the receipt';

    await expect(insurance.changeStatus(claim._id, { status: 'SETTLED' }, null))
      .rejects.toThrow(/connection reset/);

    // The claim must not be left claiming money that never moved.
    const after = await InsuranceClaim.findById(claim._id);
    expect(after.status).toBe('APPROVED');
    expect(after.history.at(-1).note).toMatch(/reversed/i);

    const inv = await Invoice.findById(invoice._id);
    expect(inv.paidAmount).toBe(0);
    expect(await Payment.countDocuments({ invoice: invoice._id })).toBe(0);
  }));

  it('can be settled again after a reversal', () => inTenant(async () => {
    const claim = await approvedClaim(rs(50000), rs(40000));
    failNextPayment.reason = 'transient failure';
    await expect(insurance.changeStatus(claim._id, { status: 'SETTLED' }, null)).rejects.toBeTruthy();

    // Back at APPROVED, so the retry is a legal transition and actually pays.
    const settled = await insurance.changeStatus(claim._id, { status: 'SETTLED' }, null);
    expect(settled.status).toBe('SETTLED');
    expect((await Invoice.findById(invoice._id)).paidAmount).toBe(rs(40000));
  }));

  it('falls back to the patient policy matching the insurer', () => inTenant(async () => {
    await Patient.updateOne({ _id: patient._id }, {
      $set: {
        insurances: [
          { provider: 'Bajaj Allianz', policyNumber: 'BAJAJ-9', validTill: null },
          { provider: 'Star Health', policyNumber: 'STAR-7', validTill: null },
        ],
      },
    });

    const claim = await insurance.createClaim({
      patient: patient._id, invoice: invoice._id,
      insuranceCompany: 'Star Health', claimAmount: rs(5000),
    }, null);

    expect(claim.policyNumber).toBe('STAR-7');
  }));

  it('skips an expired policy in favour of one still in date', () => inTenant(async () => {
    const yesterday = new Date(Date.now() - 86400000);
    await Patient.updateOne({ _id: patient._id }, {
      $set: {
        insurances: [
          { provider: 'Star Health', policyNumber: 'OLD-1', validTill: yesterday },
          { provider: 'Star Health', policyNumber: 'NEW-2', validTill: null },
        ],
      },
    });

    const claim = await insurance.createClaim({
      patient: patient._id, invoice: invoice._id,
      insuranceCompany: 'Star Health', claimAmount: rs(5000),
    }, null);

    expect(claim.policyNumber).toBe('NEW-2');
  }));

  it('still prefers an explicitly supplied policy number', () => inTenant(async () => {
    await Patient.updateOne({ _id: patient._id }, {
      $set: { insurances: [{ provider: 'Star Health', policyNumber: 'STAR-7', validTill: null }] },
    });

    const claim = await insurance.createClaim({
      patient: patient._id, invoice: invoice._id,
      insuranceCompany: 'Star Health', policyNumber: 'MANUAL-1', claimAmount: rs(5000),
    }, null);

    expect(claim.policyNumber).toBe('MANUAL-1');
  }));

  it('rejects a transition the workflow does not allow', () => inTenant(async () => {
    const claim = await insurance.createClaim({
      patient: patient._id, invoice: invoice._id,
      insuranceCompany: 'Star Health', policyNumber: 'POL-1', claimAmount: rs(1000),
    }, null);

    // DRAFT cannot jump straight to SETTLED.
    await expect(insurance.changeStatus(claim._id, { status: 'SETTLED' }, null))
      .rejects.toMatchObject({ errorCode: 'INVALID_STATUS_TRANSITION' });
  }));
});
