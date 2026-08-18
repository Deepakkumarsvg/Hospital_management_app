// What a given patient is actually charged for a given service.
//
// The catalogue used to carry ONE price per service, which is not how any real
// hospital bills: the same CBC costs one thing to a cash patient, another under
// CGHS, another under a corporate contract. With a single price the only
// options were to bill everyone the same or to type the right number in by
// hand every time, and the second is where revenue leaks.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb, inTenant } from './helpers.js';
import { toPaise as rs } from '../src/utils/money.js';

const { TariffPlan, TariffRate } = await import('../src/models/TariffPlan.js');
const { Patient } = await import('../src/models/Patient.js');
const { LabTest } = await import('../src/models/LabTest.js');
const tariff = await import('../src/services/tariffService.js');

let cashPatient; let cghsPatient; let cbc;
let cash; let cghs;

beforeAll(async () => { await connectTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

beforeEach(async () => {
  await inTenant(async () => {
    await Promise.all([
      TariffPlan.deleteMany({}), TariffRate.deleteMany({}),
      Patient.deleteMany({}), LabTest.deleteMany({}),
    ]);
    await TariffRate.syncIndexes();

    cbc = await LabTest.create({ name: 'Complete Blood Count', code: 'CBC', category: 'Haematology', price: 400 });

    // The house list, and a panel that pays 20% less with negotiated exceptions.
    cash = await tariff.createPlan({ name: 'Cash', code: 'CASH', isDefault: true });
    cghs = await tariff.createPlan({ name: 'CGHS', code: 'CGHS', baseAdjustmentPercent: -20 });

    [cashPatient, cghsPatient] = await Patient.create([
      { firstName: 'Cash', lastName: 'Payer', gender: 'OTHER', dateOfBirth: '1990-01-01', phone: '9000000091' },
      { firstName: 'Cghs', lastName: 'Payer', gender: 'OTHER', dateOfBirth: '1990-01-01', phone: '9000000092', tariffPlan: cghs._id },
    ]);
  });
});

const priceOf = (patient, catalogRupees = 400) =>
  tariff.priceFor(patient._id, 'LAB_TEST', cbc._id, rs(catalogRupees));

describe('choosing the plan', () => {
  it('uses the house default for a patient on no plan', () => inTenant(async () => {
    const plan = await tariff.planForPatient(cashPatient._id);
    expect(plan.code).toBe('CASH');
  }));

  it('uses the patient own plan when they have one', () => inTenant(async () => {
    const plan = await tariff.planForPatient(cghsPatient._id);
    expect(plan.code).toBe('CGHS');
  }));

  it('falls back to the default when that plan has been deactivated', () => inTenant(async () => {
    // A lapsed contract is an administrative event, not a reason to start
    // charging that patient list price today.
    await TariffPlan.updateOne({ _id: cghs._id }, { status: 'INACTIVE' });
    const plan = await tariff.planForPatient(cghsPatient._id);
    expect(plan.code).toBe('CASH');
  }));
});

describe('resolving a price', () => {
  it('charges list price under a plan with no adjustment', () => inTenant(async () => {
    expect(await priceOf(cashPatient)).toBe(rs(400));
  }));

  it('applies the blanket adjustment to unlisted services', () => inTenant(async () => {
    // "Our list, minus 20%" is how most contracts actually read, and why every
    // service does not need a row of its own.
    expect(await priceOf(cghsPatient)).toBe(rs(320));
  }));

  it('prefers a negotiated rate over the blanket adjustment', () => inTenant(async () => {
    await tariff.setRate(cghs._id, { serviceType: 'LAB_TEST', service: cbc._id, price: rs(250) });
    expect(await priceOf(cghsPatient)).toBe(rs(250));
  }));

  it('honours a negotiated rate of zero', () => inTenant(async () => {
    // A service the panel covers entirely is a real price, not a missing one.
    await tariff.setRate(cghs._id, { serviceType: 'LAB_TEST', service: cbc._id, price: 0 });
    expect(await priceOf(cghsPatient)).toBe(0);
  }));

  it('falls back to the adjustment when an override is removed, not to zero', () => inTenant(async () => {
    await tariff.setRate(cghs._id, { serviceType: 'LAB_TEST', service: cbc._id, price: rs(250) });
    await tariff.setRate(cghs._id, { serviceType: 'LAB_TEST', service: cbc._id, price: null });

    expect(await TariffRate.countDocuments({ plan: cghs._id })).toBe(0);
    expect(await priceOf(cghsPatient)).toBe(rs(320));
  }));

  it('keeps rates for different service types apart', () => inTenant(async () => {
    // The same id under two service types is two different things.
    await tariff.setRate(cghs._id, { serviceType: 'LAB_TEST', service: cbc._id, price: rs(250) });
    await tariff.setRate(cghs._id, { serviceType: 'BED', service: cbc._id, price: rs(1500) });

    const resolve = await tariff.priceResolver(cghsPatient._id);
    expect(resolve('LAB_TEST', cbc._id, rs(400))).toBe(rs(250));
    expect(resolve('BED', cbc._id, rs(2000))).toBe(rs(1500));
  }));

  it('never resolves below zero however steep the discount', () => inTenant(async () => {
    const free = await tariff.createPlan({ name: 'Charity', code: 'CHARITY', baseAdjustmentPercent: -100 });
    await Patient.updateOne({ _id: cashPatient._id }, { tariffPlan: free._id });
    expect(await priceOf(cashPatient)).toBe(0);
  }));

  it('supports a premium as well as a discount', () => inTenant(async () => {
    const premium = await tariff.createPlan({ name: 'International', code: 'INTL', baseAdjustmentPercent: 25 });
    await Patient.updateOne({ _id: cashPatient._id }, { tariffPlan: premium._id });
    expect(await priceOf(cashPatient)).toBe(rs(500));
  }));
});

describe('exactly one default', () => {
  it('clears the previous default when another is set', () => inTenant(async () => {
    await tariff.setDefaultPlan(cghs._id);

    const defaults = await TariffPlan.find({ isDefault: true });
    expect(defaults).toHaveLength(1);
    expect(defaults[0].code).toBe('CGHS');
  }));

  it('refuses to make an inactive plan the default', () => inTenant(async () => {
    await TariffPlan.updateOne({ _id: cghs._id }, { status: 'INACTIVE' });
    await expect(tariff.setDefaultPlan(cghs._id))
      .rejects.toMatchObject({ errorCode: 'TARIFF_PLAN_INACTIVE' });
  }));

  it('refuses to delete the default plan', () => inTenant(async () => {
    await expect(tariff.deletePlan(cash._id))
      .rejects.toMatchObject({ errorCode: 'TARIFF_PLAN_IS_DEFAULT' });
  }));

  it('refuses to delete a plan patients are on', () => inTenant(async () => {
    await expect(tariff.deletePlan(cghs._id))
      .rejects.toMatchObject({ errorCode: 'TARIFF_PLAN_IN_USE' });
  }));

  it('deletes an unused plan along with its rates', () => inTenant(async () => {
    const spare = await tariff.createPlan({ name: 'Spare', code: 'SPARE' });
    await tariff.setRate(spare._id, { serviceType: 'LAB_TEST', service: cbc._id, price: rs(100) });

    await tariff.deletePlan(spare._id);
    expect(await TariffPlan.findById(spare._id)).toBeNull();
    expect(await TariffRate.countDocuments({ plan: spare._id })).toBe(0);
  }));
});

describe('bulk rate import', () => {
  it('upserts a whole price list in one call', () => inTenant(async () => {
    const esr = await LabTest.create({ name: 'ESR', code: 'ESR', category: 'Haematology', price: 200 });

    const { updated } = await tariff.setRatesBulk(cghs._id, 'LAB_TEST', [
      { service: cbc._id, price: rs(250) },
      { service: esr._id, price: rs(120) },
    ]);
    expect(updated).toBe(2);

    const resolve = await tariff.priceResolver(cghsPatient._id);
    expect(resolve('LAB_TEST', cbc._id, rs(400))).toBe(rs(250));
    expect(resolve('LAB_TEST', esr._id, rs(200))).toBe(rs(120));
  }));

  it('overwrites an existing rate rather than duplicating it', () => inTenant(async () => {
    await tariff.setRate(cghs._id, { serviceType: 'LAB_TEST', service: cbc._id, price: rs(250) });
    await tariff.setRatesBulk(cghs._id, 'LAB_TEST', [{ service: cbc._id, price: rs(199) }]);

    expect(await TariffRate.countDocuments({ plan: cghs._id, service: cbc._id })).toBe(1);
    expect(await priceOf(cghsPatient)).toBe(rs(199));
  }));
});

describe('the plan reaches the bill', () => {
  it('prices a lab order through the patient plan, not the catalogue', () => inTenant(async () => {
    const { LabOrder } = await import('../src/models/LabOrder.js');
    const billing = await import('../src/services/billingService.js');

    // The same order for two patients on two plans.
    for (const patient of [cashPatient, cghsPatient]) {
      await LabOrder.create({
        patient: patient._id,
        items: [{ test: cbc._id, name: 'Complete Blood Count', price: 400 }],
      });
    }

    const cashLine = (await billing.billingSuggestions(String(cashPatient._id)))
      .find((l) => l.sourceType === 'LAB_ORDER');
    const cghsLine = (await billing.billingSuggestions(String(cghsPatient._id)))
      .find((l) => l.sourceType === 'LAB_ORDER');

    // Suggestions are in rupees; the plan applies its 20% underneath.
    expect(cashLine.unitPrice).toBe(400);
    expect(cghsLine.unitPrice).toBe(320);
  }));

  it('uses a negotiated rate on the bill when one exists', () => inTenant(async () => {
    const { LabOrder } = await import('../src/models/LabOrder.js');
    const billing = await import('../src/services/billingService.js');

    await tariff.setRate(cghs._id, { serviceType: 'LAB_TEST', service: cbc._id, price: rs(275) });
    await LabOrder.create({
      patient: cghsPatient._id,
      items: [{ test: cbc._id, name: 'Complete Blood Count', price: 400 }],
    });

    const line = (await billing.billingSuggestions(String(cghsPatient._id)))
      .find((l) => l.sourceType === 'LAB_ORDER');
    expect(line.unitPrice).toBe(275);
  }));
});
