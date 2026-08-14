import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb, inTenant } from './helpers.js';

const { Invoice } = await import('../src/models/Invoice.js');

// Invoice construction now resolves via the tenant connection, so these run
// inside a tenant context (still fast — just the money math).
beforeAll(async () => { await connectTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

function makeInvoice(overrides = {}) {
  return new Invoice({
    patient: '000000000000000000000000',
    items: [
      { description: 'Consultation', quantity: 2, unitPrice: 100 },
      { description: 'Lab', quantity: 1, unitPrice: 50 },
    ],
    discount: 50,
    taxPercent: 10,
    paidAmount: 0,
    ...overrides,
  });
}

describe('Invoice.recompute', () => {
  it('computes subtotal, tax and grand total correctly', () => inTenant(async () => {
    const inv = makeInvoice();
    inv.recompute();
    expect(inv.subtotal).toBe(250);
    expect(inv.tax).toBe(20);
    expect(inv.grandTotal).toBe(220);
    expect(inv.dueAmount).toBe(220);
    expect(inv.status).toBe('PENDING');
  }));

  it('marks the invoice PAID when fully paid', () => inTenant(async () => {
    const inv = makeInvoice({ paidAmount: 220 });
    inv.recompute();
    expect(inv.dueAmount).toBe(0);
    expect(inv.status).toBe('PAID');
  }));

  it('marks the invoice PARTIAL on a partial payment', () => inTenant(async () => {
    const inv = makeInvoice({ paidAmount: 100 });
    inv.recompute();
    expect(inv.dueAmount).toBe(120);
    expect(inv.status).toBe('PARTIAL');
  }));

  it('does not flip a CANCELLED invoice back to a paid status', () => inTenant(async () => {
    const inv = makeInvoice({ status: 'CANCELLED', paidAmount: 0 });
    inv.recompute();
    expect(inv.status).toBe('CANCELLED');
  }));
});
