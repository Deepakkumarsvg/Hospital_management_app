// List search must stay a search.
//
// The old implementation resolved referenced records with an uncapped
// `find(...).select('_id')` and fed the result into an `$in`. Searching a
// single letter therefore loaded every matching patient id into the API process
// and asked MongoDB to match against an $in of that size — the most reliable
// way to take this system down at real data volumes.
//
// These tests cover both halves: that search still finds what it should, and
// that a deliberately broad term cannot drag the whole collection through.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb, inTenant } from './helpers.js';
import { toPaise as rs } from '../src/utils/money.js';

const { Patient } = await import('../src/models/Patient.js');
const { Invoice } = await import('../src/models/Invoice.js');
const billing = await import('../src/services/billingService.js');
const { buildSearchFilter, cappedIds, prefixRegex } = await import('../src/services/searchFilters.js');
const { declareIndexes, buildIndexes, INDEXED_MODELS } = await import('../src/models/indexes.js');

beforeAll(async () => { await connectTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

beforeEach(async () => {
  await inTenant(async () => {
    await Promise.all([Patient.deleteMany({}), Invoice.deleteMany({})]);
  });
});

const makePatient = (firstName, lastName, phone) => Patient.create({
  firstName, lastName, gender: 'OTHER', dateOfBirth: '1990-01-01', phone,
});

describe('search still finds things', () => {
  it('matches a patient by first name', () => inTenant(async () => {
    const p = await makePatient('Anjali', 'Verma', '9100000001');
    await makePatient('Rohit', 'Sharma', '9100000002');
    await billing.createInvoice({ patient: p._id, items: [{ description: 'X', unitPrice: rs(10) }] }, null);

    const { items } = await billing.listInvoices({ page: 1, limit: 20, search: 'Anjali' });
    expect(items).toHaveLength(1);
  }));

  it('matches by UHID', () => inTenant(async () => {
    const p = await makePatient('Anjali', 'Verma', '9100000003');
    await billing.createInvoice({ patient: p._id, items: [{ description: 'X', unitPrice: rs(10) }] }, null);

    const fresh = await Patient.findById(p._id);
    const { items } = await billing.listInvoices({ page: 1, limit: 20, search: fresh.uhid });
    expect(items).toHaveLength(1);
  }));

  it('matches on the invoice number itself', () => inTenant(async () => {
    const p = await makePatient('Anjali', 'Verma', '9100000004');
    const inv = await billing.createInvoice({ patient: p._id, items: [{ description: 'X', unitPrice: rs(10) }] }, null);

    const { items } = await billing.listInvoices({ page: 1, limit: 20, search: inv.invoiceNo });
    expect(items).toHaveLength(1);
  }));

  it('returns nothing rather than everything when a term matches nobody', () => inTenant(async () => {
    const p = await makePatient('Anjali', 'Verma', '9100000005');
    await billing.createInvoice({ patient: p._id, items: [{ description: 'X', unitPrice: rs(10) }] }, null);

    // The dangerous failure mode: an unmatched search dropping its clause and
    // silently listing the whole collection.
    const { items } = await billing.listInvoices({ page: 1, limit: 20, search: 'ZZZ-nobody' });
    expect(items).toHaveLength(0);
  }));

  it('ignores an empty search entirely', () => inTenant(async () => {
    const p = await makePatient('Anjali', 'Verma', '9100000006');
    await billing.createInvoice({ patient: p._id, items: [{ description: 'X', unitPrice: rs(10) }] }, null);

    const { items } = await billing.listInvoices({ page: 1, limit: 20, search: '   ' });
    expect(items).toHaveLength(1);
  }));

  it('treats regex metacharacters as literal text', () => inTenant(async () => {
    // A search box is not a regex console; ".*" must find nothing, not everything.
    const p = await makePatient('Anjali', 'Verma', '9100000007');
    await billing.createInvoice({ patient: p._id, items: [{ description: 'X', unitPrice: rs(10) }] }, null);

    const { items } = await billing.listInvoices({ page: 1, limit: 20, search: '.*' });
    expect(items).toHaveLength(0);
  }));
});

describe('search is bounded', () => {
  it('caps how many referenced records a broad term can pull in', () => inTenant(async () => {
    // 600 patients sharing a prefix, against a cap of 500.
    const docs = Array.from({ length: 600 }, (_, i) => ({
      firstName: `Common${String(i).padStart(4, '0')}`,
      lastName: 'Name',
      gender: 'OTHER',
      dateOfBirth: new Date('1990-01-01'),
      phone: `92${String(i).padStart(8, '0')}`,
      uhid: `BULK-${i}`,
    }));
    await Patient.insertMany(docs);

    const ids = await cappedIds(Patient, ['firstName'], 'Common');
    expect(ids.length).toBe(500);
    expect(ids.length).toBeLessThan(600);
  }));

  it('anchors name lookups at the start so the index can be used', () => {
    // An unanchored regex cannot use an index at all, which is what made the
    // old queries scan the collection twice over.
    expect(prefixRegex('ver').source).toBe('^ver');
    expect(prefixRegex('a.b').source).toBe('^a\\.b'); // and still escaped
  });

  it('builds a filter that matches nothing when no branch matched', async () => {
    const filter = await inTenant(() => buildSearchFilter('nobody-at-all', [], { patient: true }));
    expect(filter).toEqual({ _id: null });
  });
});

describe('declared indexes', () => {
  it('declares an index on every planned model without throwing', () => {
    // declareIndexes works off the schema registry rather than the per-tenant
    // model proxies, so it must be safe to call with no tenant bound.
    expect(() => declareIndexes()).not.toThrow();
    expect(INDEXED_MODELS.length).toBeGreaterThan(25);
  });

  it('builds them all in a tenant database', () => inTenant(async () => {
    const { total, failed } = await buildIndexes();
    expect(failed).toEqual([]);
    expect(total).toBe(INDEXED_MODELS.length);
  }), 60000);

  it('actually creates the compound index the invoice list sorts on', () => inTenant(async () => {
    await buildIndexes();
    const names = (await Invoice.collection.indexes()).map((i) => JSON.stringify(i.key));
    expect(names).toContain(JSON.stringify({ status: 1, createdAt: -1 }));
  }), 60000);
});
