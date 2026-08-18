// GST as an Indian hospital actually has to issue it.
//
// The invoice used to carry one `taxPercent` for the whole bill. That cannot
// represent a hospital invoice: clinical services are exempt while the pharmacy
// counter is fully taxable, so one bill mixes both, and a single rate is wrong
// in two directions at once. Nor could it split CGST/SGST from IGST, without
// which the document is not a tax invoice at all.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, connectTestDb, disconnectTestDb, inTenant, seedBase, login, auth } from './helpers.js';
import { toPaise as rs } from '../src/utils/money.js';

const { Invoice } = await import('../src/models/Invoice.js');
const { Patient } = await import('../src/models/Patient.js');
const { Setting } = await import('../src/models/Setting.js');
const { splitTax, taxTreatmentForLine, stateCodeOfGstin, ROOM_RENT_EXEMPTION_LIMIT_PAISE } =
  await import('../src/config/gst.js');

let token;
let patientId;

// Maharashtra (27) — the hospital's own state throughout these tests.
const HOME_GSTIN = '27AAPFU0939F1ZV';

beforeAll(async () => {
  await connectTestDb();
  await seedBase();
  token = await login('admin@test.local', 'Admin@123');
  await inTenant(async () => {
    const p = await Patient.create({
      firstName: 'Gst', lastName: 'Payer', gender: 'OTHER',
      dateOfBirth: '1980-01-01', phone: '9000000081',
    });
    patientId = String(p._id);
  });
});

afterAll(async () => { await disconnectTestDb(); });

beforeEach(async () => {
  await inTenant(async () => {
    await Invoice.deleteMany({});
    await Setting.updateOne({}, { $set: { gstin: HOME_GSTIN, stateCode: '27' } }, { upsert: true });
  });
});

const createInvoice = (body) =>
  request(app).post('/api/billing/invoices').set(auth(token)).send({ patient: patientId, ...body });

const stored = (res) => inTenant(() => Invoice.findById(res.body.data.id || res.body.data._id));

describe('tax split', () => {
  it('halves an intra-state tax into CGST and SGST', () => {
    expect(splitTax(1000, false)).toEqual({ cgst: 500, sgst: 500, igst: 0 });
  });

  it('puts an inter-state tax entirely under IGST', () => {
    expect(splitTax(1000, true)).toEqual({ cgst: 0, sgst: 0, igst: 1000 });
  });

  it('never loses a paisa on an odd amount', () => {
    // Rounding an odd number of paise twice gives two halves that do not add
    // back up — and a tax invoice whose CGST + SGST differs from its total tax
    // by a paisa fails validation.
    for (const tax of [1, 3, 7, 99, 12345]) {
      const { cgst, sgst, igst } = splitTax(tax, false);
      expect(cgst + sgst + igst).toBe(tax);
    }
  });
});

describe('category defaults', () => {
  it('treats clinical services as exempt', () => {
    for (const category of ['CONSULTATION', 'LABORATORY', 'RADIOLOGY', 'SURGERY', 'PROCEDURE']) {
      expect(taxTreatmentForLine({ category }).treatment).toBe('EXEMPT');
    }
  });

  it('treats medicine as taxable', () => {
    const d = taxTreatmentForLine({ category: 'MEDICINE' });
    expect(d.treatment).toBe('TAXABLE');
    expect(d.rate).toBe(12);
    expect(d.hsnSac).toBe('3004');
  });

  it('exempts a bed below the room-rent threshold', () => {
    const d = taxTreatmentForLine({ category: 'BED', unitPrice: ROOM_RENT_EXEMPTION_LIMIT_PAISE - 1 });
    expect(d.treatment).toBe('EXEMPT');
  });

  it('taxes a bed above the threshold at 5%', () => {
    // The 2022 change to entry 74: the same ward is exempt at ₹4,000 a night
    // and taxable at ₹6,000, so the rate decides, not the category.
    const d = taxTreatmentForLine({ category: 'BED', unitPrice: ROOM_RENT_EXEMPTION_LIMIT_PAISE + 1 });
    expect(d.treatment).toBe('TAXABLE');
    expect(d.rate).toBe(5);
  });

  it('reads the state code off a GSTIN', () => {
    expect(stateCodeOfGstin(HOME_GSTIN)).toBe('27');
    expect(stateCodeOfGstin('not-a-gstin')).toBe('');
  });
});

describe('a bill that mixes exempt and taxable lines', () => {
  it('taxes only the taxable part', async () => {
    const res = await createInvoice({
      items: [
        { category: 'CONSULTATION', description: 'OPD consult', unitPrice: 500 },
        { category: 'MEDICINE', description: 'Paracetamol', quantity: 2, unitPrice: 100 },
      ],
    });
    expect(res.status).toBe(201);

    const inv = res.body.data;
    expect(inv.exemptValue).toBe(500);   // the consult
    expect(inv.taxableValue).toBe(200);  // the medicine
    expect(inv.tax).toBe(24);            // 12% of 200
    expect(inv.grandTotal).toBe(724);
  });

  it('splits that tax into CGST and SGST for a local patient', async () => {
    const res = await createInvoice({
      items: [{ category: 'MEDICINE', description: 'Paracetamol', unitPrice: 200 }],
    });
    const inv = res.body.data;
    expect(inv.totalCgst).toBe(12);
    expect(inv.totalSgst).toBe(12);
    expect(inv.totalIgst).toBe(0);
    expect(inv.isInterState).toBe(false);
  });

  it('uses IGST when the bill is to another state', async () => {
    // A Karnataka (29) company being billed by a Maharashtra (27) hospital.
    const res = await createInvoice({
      customerGstin: '29AAPFU0939F1ZV',
      items: [{ category: 'MEDICINE', description: 'Paracetamol', unitPrice: 200 }],
    });
    const inv = res.body.data;
    expect(inv.isInterState).toBe(true);
    expect(inv.placeOfSupply).toBe('29');
    expect(inv.totalIgst).toBe(24);
    expect(inv.totalCgst).toBe(0);
    expect(inv.totalSgst).toBe(0);
    expect(inv.tax).toBe(24); // the amount is the same; only the head differs
  });

  it('records HSN/SAC per line', async () => {
    const res = await createInvoice({
      items: [
        { category: 'CONSULTATION', description: 'OPD consult', unitPrice: 500 },
        { category: 'MEDICINE', description: 'Paracetamol', unitPrice: 100 },
      ],
    });
    const [consult, medicine] = res.body.data.items;
    expect(consult.hsnSac).toBe('9993');  // SAC — human health services
    expect(medicine.hsnSac).toBe('3004'); // HSN — packaged medicaments
  });

  it('lets a line override its category default', async () => {
    // A cosmetic procedure is not exempt healthcare, whatever its category says.
    const res = await createInvoice({
      items: [{
        category: 'PROCEDURE', description: 'Cosmetic — rhinoplasty',
        unitPrice: 100000, taxTreatment: 'TAXABLE', taxRatePercent: 18,
      }],
    });
    const inv = res.body.data;
    expect(inv.taxableValue).toBe(100000);
    expect(inv.exemptValue).toBe(0);
    expect(inv.tax).toBe(18000);
  });

  it('rejects a rate that is not a GST slab', async () => {
    const res = await createInvoice({
      items: [{ category: 'MEDICINE', description: 'X', unitPrice: 100, taxRatePercent: 7 }],
    });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed GSTIN', async () => {
    const res = await createInvoice({
      customerGstin: '29NOTAGSTIN',
      items: [{ category: 'MEDICINE', description: 'X', unitPrice: 100 }],
    });
    expect(res.status).toBe(400);
  });
});

describe('discount is apportioned before tax', () => {
  it('charges tax on what was actually billed, not on the list price', async () => {
    // ₹1,000 of exempt consult + ₹1,000 of taxable medicine, less ₹200.
    // The discount splits evenly, so the medicine is taxed on ₹900, not ₹1,000.
    const res = await createInvoice({
      discount: 200,
      items: [
        { category: 'CONSULTATION', description: 'Consult', unitPrice: 1000 },
        { category: 'MEDICINE', description: 'Medicine', unitPrice: 1000 },
      ],
    });

    const inv = res.body.data;
    expect(inv.exemptValue).toBe(900);
    expect(inv.taxableValue).toBe(900);
    expect(inv.tax).toBe(108); // 12% of 900
    expect(inv.grandTotal).toBe(1908); // 2000 - 200 + 108
  });

  it('apportions to the last paisa', () => inTenant(async () => {
    // Three lines and a discount that does not divide by three. The parts must
    // still add back up to the whole exactly.
    const res = await createInvoice({
      discount: 10,
      items: [
        { category: 'MEDICINE', description: 'A', unitPrice: 33.33 },
        { category: 'MEDICINE', description: 'B', unitPrice: 33.33 },
        { category: 'MEDICINE', description: 'C', unitPrice: 33.34 },
      ],
    });

    const inv = await stored(res);
    const apportioned = inv.items.reduce((s, it) => s + (it.amount - it.taxableValue), 0);
    expect(apportioned).toBe(rs(10));
    expect(inv.taxableValue).toBe(inv.subtotal - inv.discount);
  }));

  it('leaves nothing taxable when the discount swallows the bill', async () => {
    const res = await createInvoice({
      discount: 500,
      items: [{ category: 'MEDICINE', description: 'Free sample', unitPrice: 500 }],
    });
    const inv = res.body.data;
    expect(inv.taxableValue).toBe(0);
    expect(inv.tax).toBe(0);
    expect(inv.grandTotal).toBe(0);
  });
});

describe('the totals always agree', () => {
  it('leaves an uncategorised line exempt rather than inventing tax on it', async () => {
    // A default that quietly adds 18% would put a charge on the patient's bill
    // that nobody decided to make.
    const res = await createInvoice({
      items: [{ description: 'Miscellaneous', unitPrice: 1000 }],
    });
    const inv = res.body.data;
    expect(inv.items[0].taxTreatment).toBe('EXEMPT');
    expect(inv.tax).toBe(0);
    expect(inv.grandTotal).toBe(1000);
  });

  it('keeps line tax adding up to the invoice tax', () => inTenant(async () => {
    const res = await createInvoice({
      discount: 137,
      items: [
        { category: 'MEDICINE', description: 'A', quantity: 3, unitPrice: 199.99 },
        { category: 'CONSULTATION', description: 'B', unitPrice: 750 },
        { category: 'OTHER', description: 'C', unitPrice: 249.5, taxTreatment: 'TAXABLE', taxRatePercent: 18 },
      ],
    });

    const inv = await stored(res);
    const lineTax = inv.items.reduce((s, it) => s + it.taxAmount, 0);
    const lineHeads = inv.items.reduce((s, it) => s + it.cgst + it.sgst + it.igst, 0);

    expect(lineTax).toBe(inv.tax);
    expect(lineHeads).toBe(inv.tax);
    expect(inv.totalCgst + inv.totalSgst + inv.totalIgst).toBe(inv.tax);
    // Exempt + taxable is the whole bill after discount, with nothing lost.
    expect(inv.taxableValue + inv.exemptValue).toBe(inv.subtotal - inv.discount);
    expect(inv.grandTotal).toBe(inv.subtotal - inv.discount + inv.tax);
  }));

  it('still honours a whole-invoice rate on a bill raised before per-line tax', () => inTenant(async () => {
    // Built directly, the way an old document looks: a taxPercent and no line
    // treatments. It must recompute to the total it was issued with.
    const inv = new Invoice({
      patient: patientId,
      items: [{ description: 'Legacy line', quantity: 1, unitPrice: rs(1000) }],
      taxPercent: 18,
    });
    inv.recompute();

    expect(inv.tax).toBe(rs(180));
    expect(inv.grandTotal).toBe(rs(1180));
  }));
});
