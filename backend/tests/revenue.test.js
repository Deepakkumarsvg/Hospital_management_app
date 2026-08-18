// Nothing the hospital does for a patient should be invisible to billing.
//
// Every module that earns money — the bed, the theatre, the blood bank, the
// ambulance, the consultation — has to surface as a billable line, exactly
// once. These tests exist because all five of those used to earn nothing at
// all: a patient could stay a week and be billed zero for the bed.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, connectTestDb, disconnectTestDb, inTenant, seedBase, login, auth } from './helpers.js';
import { toPaise as rs } from '../src/utils/money.js';

const { IPDAdmission } = await import('../src/models/IPDAdmission.js');
const { Ward } = await import('../src/models/Ward.js');
const { Room } = await import('../src/models/Room.js');
const { Bed } = await import('../src/models/Bed.js');
const { Patient } = await import('../src/models/Patient.js');
const { Doctor } = await import('../src/models/Doctor.js');
const { Department } = await import('../src/models/Department.js');
const { Invoice } = await import('../src/models/Invoice.js');
const { Surgery } = await import('../src/models/Surgery.js');
const { OperationTheatre } = await import('../src/models/OperationTheatre.js');
const { BloodUnit } = await import('../src/models/BloodUnit.js');
const { Ambulance } = await import('../src/models/Ambulance.js');
const { AmbulanceTrip } = await import('../src/models/AmbulanceTrip.js');
const { OPDVisit } = await import('../src/models/OPDVisit.js');

const billing = await import('../src/services/billingService.js');
const ipd = await import('../src/services/ipdService.js');
const { accruedBedNights } = await import('../src/services/bedCharges.js');

let patient; let doctor; let dept; let ward; let room; let bedA; let bedB;
let token;

const DAY = 24 * 60 * 60 * 1000;
const at = (iso) => new Date(iso);

beforeAll(async () => {
  await connectTestDb();
  await seedBase();
  token = await login('admin@test.local', 'Admin@123');
});
afterAll(async () => { await disconnectTestDb(); });

beforeEach(async () => {
  await inTenant(async () => {
    await Promise.all([
      IPDAdmission.deleteMany({}), Ward.deleteMany({}), Room.deleteMany({}), Bed.deleteMany({}),
      Patient.deleteMany({}), Doctor.deleteMany({}), Department.deleteMany({}), Invoice.deleteMany({}),
      Surgery.deleteMany({}), OperationTheatre.deleteMany({}), BloodUnit.deleteMany({}),
      Ambulance.deleteMany({}), AmbulanceTrip.deleteMany({}), OPDVisit.deleteMany({}),
    ]);

    dept = await Department.create({ name: 'General', code: 'GEN' });
    ward = await Ward.create({ name: 'General Ward', code: 'GW', type: 'GENERAL' });
    room = await Room.create({ ward: ward._id, roomNo: '101' });
    // Two beds at different rates, so a transfer has something to get wrong.
    bedA = await Bed.create({ ward: ward._id, room: room._id, bedNo: 'A1', dailyCharge: 2000 });
    bedB = await Bed.create({ ward: ward._id, room: room._id, bedNo: 'B1', dailyCharge: 5000 });

    patient = await Patient.create({
      firstName: 'Ravi', lastName: 'Kumar', gender: 'MALE', dateOfBirth: '1975-06-15',
      phone: '9000000051', bloodGroup: 'O+',
    });
    doctor = await Doctor.create({
      firstName: 'Anil', lastName: 'Shah', registrationNo: 'REG-REV-1', specialization: 'Medicine',
      department: dept._id, phone: '9000000052', consultationFee: 700,
    });
  });
});

const admit = (overrides = {}) => ipd.admitPatient({
  patient: patient._id,
  admittingDoctor: doctor._id,
  department: dept._id,
  bed: bedA._id,
  reason: 'Observation',
  ...overrides,
}, null);

const suggestionsFor = () => billing.billingSuggestions(String(patient._id));
const bedLines = (s) => s.filter((l) => l.sourceType === 'IPD_BED');

describe('bed charges accrue per night', () => {
  it('charges one day for a stay that crosses no midnight', () => inTenant(async () => {
    const adm = await admit();
    await IPDAdmission.updateOne({ _id: adm._id }, {
      admissionDate: at('2026-04-01T09:00:00'),
      'bedStays.0.from': at('2026-04-01T09:00:00'),
    });
    const fresh = await IPDAdmission.findById(adm._id);

    const nights = accruedBedNights(fresh, at('2026-04-01T18:00:00'));
    expect(nights).toHaveLength(1);
    expect(nights[0].dailyCharge).toBe(2000);
  }));

  it('charges one night per midnight occupied', () => inTenant(async () => {
    const adm = await admit();
    await IPDAdmission.updateOne({ _id: adm._id }, {
      admissionDate: at('2026-04-01T09:00:00'),
      'bedStays.0.from': at('2026-04-01T09:00:00'),
    });
    const fresh = await IPDAdmission.findById(adm._id);

    // Admitted the 1st, still in on the 4th → nights of the 2nd, 3rd and 4th.
    const nights = accruedBedNights(fresh, at('2026-04-04T10:00:00'));
    expect(nights.map((n) => n.date)).toEqual(['2026-04-02', '2026-04-03', '2026-04-04']);
  }));

  it('prices each night at the bed occupied that night', () => inTenant(async () => {
    const adm = await admit();
    // Rewrite the stay as: bed A for the first night, bed B from midday on the 2nd.
    await IPDAdmission.updateOne({ _id: adm._id }, {
      admissionDate: at('2026-04-01T09:00:00'),
      bedStays: [
        { bed: bedA._id, bedNo: 'A1', dailyCharge: 2000, from: at('2026-04-01T09:00:00'), to: at('2026-04-02T12:00:00') },
        { bed: bedB._id, bedNo: 'B1', dailyCharge: 5000, from: at('2026-04-02T12:00:00'), to: null },
      ],
    });
    const fresh = await IPDAdmission.findById(adm._id);

    const nights = accruedBedNights(fresh, at('2026-04-03T10:00:00'));
    // Night of the 2nd was spent in A (the move happened at midday on the 2nd,
    // after that midnight); the night of the 3rd in B.
    expect(nights).toHaveLength(2);
    expect(nights[0]).toMatchObject({ date: '2026-04-02', dailyCharge: 2000 });
    expect(nights[1]).toMatchObject({ date: '2026-04-03', dailyCharge: 5000 });
  }));

  it('stops accruing once the patient is discharged', () => inTenant(async () => {
    const adm = await admit();
    await ipd.dischargePatient(adm._id, { dischargeDate: new Date(Date.now() + 2 * DAY) });

    const closed = await IPDAdmission.findById(adm._id);
    // The occupancy segment must be closed, or the bed bills forever.
    expect(closed.bedStays.every((s) => s.to)).toBe(true);

    const before = accruedBedNights(closed, new Date(Date.now() + 3 * DAY)).length;
    const later = accruedBedNights(closed, new Date(Date.now() + 30 * DAY)).length;
    expect(later).toBe(before);
  }));

  it('records a segment per bed when the patient is transferred', () => inTenant(async () => {
    const adm = await admit();
    await ipd.transferBed(adm._id, bedB._id);

    const moved = await IPDAdmission.findById(adm._id);
    expect(moved.bedStays).toHaveLength(2);
    expect(moved.bedStays[0]).toMatchObject({ bedNo: 'A1', dailyCharge: 2000 });
    expect(moved.bedStays[0].to).toBeTruthy();          // closed
    expect(moved.bedStays[1]).toMatchObject({ bedNo: 'B1', dailyCharge: 5000 });
    expect(moved.bedStays[1].to).toBeNull();            // open
  }));
});

describe('every revenue source reaches the bill', () => {
  it('offers the bed nights of an ongoing admission', () => inTenant(async () => {
    const adm = await admit();
    await IPDAdmission.updateOne({ _id: adm._id }, {
      admissionDate: at('2026-04-01T09:00:00'),
      'bedStays.0.from': at('2026-04-01T09:00:00'),
    });

    const lines = bedLines(await suggestionsFor());
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0].unitPrice).toBe(2000);
    expect(lines[0].category).toBe('BED');
  }));

  it('offers a completed surgery', () => inTenant(async () => {
    const theatre = await OperationTheatre.create({ name: 'OT-1', code: 'OT1' });
    await Surgery.create({
      patient: patient._id, theatre: theatre._id, surgeon: doctor._id,
      procedure: 'Appendectomy', scheduledDate: new Date(), charges: 45000, status: 'COMPLETED',
    });

    const line = (await suggestionsFor()).find((l) => l.sourceType === 'SURGERY');
    expect(line).toBeTruthy();
    expect(line.unitPrice).toBe(45000);
    expect(line.description).toMatch(/Appendectomy/);
  }));

  it('offers an issued blood unit', () => inTenant(async () => {
    await BloodUnit.create({
      bloodGroup: 'O+', component: 'PRBC', expiryDate: new Date(Date.now() + 30 * DAY),
      status: 'ISSUED', issuedTo: patient._id, chargeAmount: 1500,
    });

    const line = (await suggestionsFor()).find((l) => l.sourceType === 'BLOOD_UNIT');
    expect(line).toBeTruthy();
    expect(line.unitPrice).toBe(1500);
  }));

  it('offers a completed ambulance trip', () => inTenant(async () => {
    const amb = await Ambulance.create({ vehicleNo: 'KA01AB1234', type: 'BASIC' });
    await AmbulanceTrip.create({
      ambulance: amb._id, patient: patient._id, pickupLocation: 'Home', dropLocation: 'Hospital',
      charges: 1200, status: 'COMPLETED',
    });

    const line = (await suggestionsFor()).find((l) => l.sourceType === 'AMBULANCE_TRIP');
    expect(line).toBeTruthy();
    expect(line.unitPrice).toBe(1200);
  }));

  it("offers the consulting doctor's fee for an OPD visit", () => inTenant(async () => {
    await OPDVisit.create({
      patient: patient._id, doctor: doctor._id, department: dept._id, diagnosis: 'Fever',
    });

    const line = (await suggestionsFor()).find((l) => l.sourceType === 'OPD_CONSULT');
    expect(line).toBeTruthy();
    expect(line.unitPrice).toBe(700);
    expect(line.description).toMatch(/Anil Shah/);
  }));

  it('leaves out a source that carries no charge', () => inTenant(async () => {
    const theatre = await OperationTheatre.create({ name: 'OT-2', code: 'OT2' });
    await Surgery.create({
      patient: patient._id, theatre: theatre._id, surgeon: doctor._id,
      procedure: 'Dressing', scheduledDate: new Date(), charges: 0, status: 'COMPLETED',
    });

    expect((await suggestionsFor()).find((l) => l.sourceType === 'SURGERY')).toBeUndefined();
  }));

  it('does not offer a surgery that is still scheduled', () => inTenant(async () => {
    const theatre = await OperationTheatre.create({ name: 'OT-3', code: 'OT3' });
    await Surgery.create({
      patient: patient._id, theatre: theatre._id, surgeon: doctor._id,
      procedure: 'Planned', scheduledDate: new Date(), charges: 9000, status: 'SCHEDULED',
    });

    expect((await suggestionsFor()).find((l) => l.sourceType === 'SURGERY')).toBeUndefined();
  }));
});

describe('nothing is billed twice', () => {
  it('drops a surgery once it has been invoiced', () => inTenant(async () => {
    const theatre = await OperationTheatre.create({ name: 'OT-1', code: 'OT1' });
    await Surgery.create({
      patient: patient._id, theatre: theatre._id, surgeon: doctor._id,
      procedure: 'Appendectomy', scheduledDate: new Date(), charges: 45000, status: 'COMPLETED',
    });

    const line = (await suggestionsFor()).find((l) => l.sourceType === 'SURGERY');
    await billing.createInvoice({
      patient: patient._id,
      items: [{ ...line, unitPrice: rs(line.unitPrice) }],
    }, null);

    expect((await suggestionsFor()).find((l) => l.sourceType === 'SURGERY')).toBeUndefined();
  }));

  it('drops only the bed nights already billed, keeping the rest of the stay', () => inTenant(async () => {
    const adm = await admit();
    await IPDAdmission.updateOne({ _id: adm._id }, {
      admissionDate: at('2026-04-01T09:00:00'),
      'bedStays.0.from': at('2026-04-01T09:00:00'),
      dischargeDate: at('2026-04-04T09:00:00'),
      status: 'DISCHARGED',
      'bedStays.0.to': at('2026-04-04T09:00:00'),
    });

    const all = bedLines(await suggestionsFor());
    expect(all).toHaveLength(3); // nights of the 2nd, 3rd, 4th

    // An interim bill covering the first night only.
    await billing.createInvoice({
      patient: patient._id,
      items: [{ ...all[0], unitPrice: rs(all[0].unitPrice) }],
    }, null);

    const remaining = bedLines(await suggestionsFor());
    expect(remaining).toHaveLength(2);
    expect(remaining.map((l) => l.sourceKey)).not.toContain(all[0].sourceKey);
  }));

  it('never offers the bed of a cancelled admission', () => inTenant(async () => {
    const adm = await admit();
    await ipd.cancelAdmission(adm._id);

    expect(bedLines(await suggestionsFor())).toHaveLength(0);
  }));

  // The dedup keys have to survive HTTP in both directions. Zod strips keys it
  // does not declare, so a suggestion posted back through the real endpoint is
  // the only way to prove sourceKey is actually stored rather than silently
  // dropped — which would leave every bed night billable forever.
  it('keeps the dedup key when the charge is posted back over HTTP', () => inTenant(async () => {
    const adm = await admit();
    await IPDAdmission.updateOne({ _id: adm._id }, {
      admissionDate: at('2026-04-01T09:00:00'),
      'bedStays.0.from': at('2026-04-01T09:00:00'),
      dischargeDate: at('2026-04-03T09:00:00'),
      status: 'DISCHARGED',
      'bedStays.0.to': at('2026-04-03T09:00:00'),
    });

    const patientId = String(patient._id);
    const listed = await request(app).get(`/api/billing/suggestions/${patientId}`).set(auth(token));
    expect(listed.status).toBe(200);

    const nights = listed.body.data.filter((l) => l.sourceType === 'IPD_BED');
    expect(nights).toHaveLength(2);

    const created = await request(app).post('/api/billing/invoices').set(auth(token)).send({
      patient: patientId,
      items: nights.map((l) => ({
        category: l.category, description: l.description, quantity: 1,
        unitPrice: l.unitPrice, sourceType: l.sourceType, sourceKey: l.sourceKey,
      })),
    });
    expect(created.status).toBe(201);

    // Stored, not stripped.
    const stored = await Invoice.findById(created.body.data.id || created.body.data._id);
    expect(stored.items.map((i) => i.sourceKey).filter(Boolean)).toHaveLength(2);

    // And therefore no longer suggested.
    const again = await request(app).get(`/api/billing/suggestions/${patientId}`).set(auth(token));
    expect(again.body.data.filter((l) => l.sourceType === 'IPD_BED')).toHaveLength(0);
  }));
});
