import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb, inTenant } from './helpers.js';
import { toPaise } from '../src/utils/money.js';

const { Invoice } = await import('../src/models/Invoice.js');

// Invoice construction now resolves via the tenant connection, so these run
// inside a tenant context (still fast — just the money math).
beforeAll(async () => { await connectTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

// These build the document directly, below the HTTP boundary, so every amount
// has to be written in the unit the model stores: paise. Spelling that out
// with toPaise() rather than hard-coding 10000 keeps the arithmetic readable
// as rupees while still failing loudly if the storage unit ever changes back.
// (tests/money.test.js covers the rupees-in/rupees-out boundary itself.)
const rs = toPaise;

function makeInvoice(overrides = {}) {
  return new Invoice({
    patient: '000000000000000000000000',
    items: [
      { description: 'Consultation', quantity: 2, unitPrice: rs(100) },
      { description: 'Lab', quantity: 1, unitPrice: rs(50) },
    ],
    discount: rs(50),
    taxPercent: 10,
    paidAmount: 0,
    ...overrides,
  });
}

describe('Invoice.recompute', () => {
  it('computes subtotal, tax and grand total correctly', () => inTenant(async () => {
    const inv = makeInvoice();
    inv.recompute();
    expect(inv.subtotal).toBe(rs(250));
    expect(inv.tax).toBe(rs(20));       // 10% of (250 - 50)
    expect(inv.grandTotal).toBe(rs(220));
    expect(inv.dueAmount).toBe(rs(220));
    expect(inv.status).toBe('PENDING');
  }));

  it('keeps every derived amount a whole number of paise', () => inTenant(async () => {
    // 7.5% of ₹333.33 is ₹24.99975 — a real fraction of a paisa, which is the
    // only place rounding is legitimate. It must land on a whole paisa, once.
    const inv = makeInvoice({
      items: [{ description: 'Odd', quantity: 1, unitPrice: rs(333.33) }],
      discount: 0,
      taxPercent: 7.5,
    });
    inv.recompute();

    for (const field of ['subtotal', 'tax', 'grandTotal', 'dueAmount']) {
      expect(Number.isInteger(inv[field])).toBe(true);
    }
    expect(inv.tax).toBe(2500);            // 24.99975 rounded to the nearest paisa
    expect(inv.grandTotal).toBe(33333 + 2500);
  }));

  it('marks the invoice PAID when fully paid', () => inTenant(async () => {
    const inv = makeInvoice({ paidAmount: rs(220) });
    inv.recompute();
    expect(inv.dueAmount).toBe(0);
    expect(inv.status).toBe('PAID');
  }));

  it('marks the invoice PARTIAL on a partial payment', () => inTenant(async () => {
    const inv = makeInvoice({ paidAmount: rs(100) });
    inv.recompute();
    expect(inv.dueAmount).toBe(rs(120));
    expect(inv.status).toBe('PARTIAL');
  }));

  it('is still PARTIAL one paisa short of the total', () => inTenant(async () => {
    const inv = makeInvoice({ paidAmount: rs(220) - 1 });
    inv.recompute();
    expect(inv.dueAmount).toBe(1);
    expect(inv.status).toBe('PARTIAL');
  }));

  it('does not flip a CANCELLED invoice back to a paid status', () => inTenant(async () => {
    const inv = makeInvoice({ status: 'CANCELLED', paidAmount: 0 });
    inv.recompute();
    expect(inv.status).toBe('CANCELLED');
  }));

  it('renders stored paise back as rupees in JSON', () => inTenant(async () => {
    const inv = makeInvoice();
    inv.recompute();
    const json = inv.toJSON();

    expect(json.grandTotal).toBe(220);
    expect(json.discount).toBe(50);
    expect(json.items[0].unitPrice).toBe(100);
    expect(json.items[0].amount).toBe(200);
  }));
});
