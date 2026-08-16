// Concurrency guarantees around bed allocation.
//
// Beds are the classic check-then-act hazard in this app: two admissions
// reading "AVAILABLE" at the same moment must not both get the bed, and a
// discharge must not free a bed that has already been handed to someone else.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb, inTenant } from './helpers.js';

const { Ward } = await import('../src/models/Ward.js');
const { Room } = await import('../src/models/Room.js');
const { Bed } = await import('../src/models/Bed.js');
const { Patient } = await import('../src/models/Patient.js');
const { Doctor } = await import('../src/models/Doctor.js');
const { Department } = await import('../src/models/Department.js');
const { IPDAdmission } = await import('../src/models/IPDAdmission.js');
const ipdService = await import('../src/services/ipdService.js');

let ctx = {};

beforeAll(async () => { await connectTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

beforeEach(async () => {
  await inTenant(async () => {
    await Promise.all([
      IPDAdmission.deleteMany({}), Bed.deleteMany({}), Room.deleteMany({}),
      Ward.deleteMany({}), Patient.deleteMany({}), Doctor.deleteMany({}), Department.deleteMany({}),
    ]);

    const dept = await Department.create({ name: 'General Medicine', code: 'GM' });
    const ward = await Ward.create({ name: 'Ward A', code: 'WA', type: 'GENERAL' });
    const room = await Room.create({ roomNo: '101', ward: ward._id });
    const [bedA, bedB] = await Promise.all([
      Bed.create({ bedNo: 'A1', room: room._id, ward: ward._id }),
      Bed.create({ bedNo: 'A2', room: room._id, ward: ward._id }),
    ]);
    const [p1, p2] = await Promise.all([
      Patient.create({ firstName: 'Asha', lastName: 'Rao', gender: 'FEMALE', dateOfBirth: '1990-01-01', phone: '9000000001' }),
      Patient.create({ firstName: 'Bala', lastName: 'Iyer', gender: 'MALE', dateOfBirth: '1985-01-01', phone: '9000000002' }),
    ]);
    const doctor = await Doctor.create({
      firstName: 'Ravi', lastName: 'Kumar', gender: 'MALE', phone: '9000000003',
      registrationNo: 'REG-001', department: dept._id, specialization: 'Physician',
    });

    ctx = { dept, ward, room, bedA, bedB, p1, p2, doctor };
  });
});

const admitData = (patient, bed) => ({
  patient: patient._id,
  admittingDoctor: ctx.doctor._id,
  department: ctx.dept._id,
  bed: bed._id,
  reason: 'Observation',
});

describe('IPD bed allocation', () => {
  it('gives a contested bed to exactly one of two concurrent admissions', () => inTenant(async () => {
    const results = await Promise.allSettled([
      ipdService.admitPatient(admitData(ctx.p1, ctx.bedA), null),
      ipdService.admitPatient(admitData(ctx.p2, ctx.bedA), null),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason.errorCode).toBe('BED_UNAVAILABLE');

    // Exactly one admission exists, and the bed points at it.
    expect(await IPDAdmission.countDocuments({ status: 'ADMITTED' })).toBe(1);
    const bed = await Bed.findById(ctx.bedA._id);
    expect(bed.status).toBe('OCCUPIED');
    expect(String(bed.currentAdmission)).toBe(String(ok[0].value._id));
  }));

  it('refuses to admit a patient who is already admitted', () => inTenant(async () => {
    await ipdService.admitPatient(admitData(ctx.p1, ctx.bedA), null);
    await expect(ipdService.admitPatient(admitData(ctx.p1, ctx.bedB), null))
      .rejects.toMatchObject({ errorCode: 'PATIENT_ALREADY_ADMITTED' });

    // The second bed must be left untouched.
    expect((await Bed.findById(ctx.bedB._id)).status).toBe('AVAILABLE');
  }));

  it('keeps the patient in place when a transfer target is taken', () => inTenant(async () => {
    const adm = await ipdService.admitPatient(admitData(ctx.p1, ctx.bedA), null);
    await ipdService.admitPatient(admitData(ctx.p2, ctx.bedB), null); // bedB now busy

    await expect(ipdService.transferBed(adm._id, ctx.bedB._id))
      .rejects.toMatchObject({ errorCode: 'BED_UNAVAILABLE' });

    const after = await IPDAdmission.findById(adm._id);
    expect(String(after.bed)).toBe(String(ctx.bedA._id));
    expect((await Bed.findById(ctx.bedA._id)).status).toBe('OCCUPIED');
  }));

  it('frees the old bed and occupies the new one on a successful transfer', () => inTenant(async () => {
    const adm = await ipdService.admitPatient(admitData(ctx.p1, ctx.bedA), null);
    await ipdService.transferBed(adm._id, ctx.bedB._id);

    const [a, b] = await Promise.all([Bed.findById(ctx.bedA._id), Bed.findById(ctx.bedB._id)]);
    expect(a.status).toBe('AVAILABLE');
    expect(a.currentAdmission).toBeNull();
    expect(b.status).toBe('OCCUPIED');
    expect(String(b.currentAdmission)).toBe(String(adm._id));
  }));

  it('discharges once even when two discharges race', () => inTenant(async () => {
    const adm = await ipdService.admitPatient(admitData(ctx.p1, ctx.bedA), null);

    const results = await Promise.allSettled([
      ipdService.dischargePatient(adm._id, {}),
      ipdService.dischargePatient(adm._id, {}),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected').reason.errorCode).toBe('ALREADY_DISCHARGED');

    const bed = await Bed.findById(ctx.bedA._id);
    expect(bed.status).toBe('AVAILABLE');
    expect(bed.currentAdmission).toBeNull();
  }));

  it('does not let a stale discharge free a bed reassigned to someone else', () => inTenant(async () => {
    const adm1 = await ipdService.admitPatient(admitData(ctx.p1, ctx.bedA), null);
    await ipdService.dischargePatient(adm1._id, {});

    // Bed A is free again and goes to the next patient.
    const adm2 = await ipdService.admitPatient(admitData(ctx.p2, ctx.bedA), null);

    // A late repeat of the first discharge must not evict the new occupant.
    await expect(ipdService.dischargePatient(adm1._id, {})).rejects.toMatchObject({ errorCode: 'ALREADY_DISCHARGED' });

    const bed = await Bed.findById(ctx.bedA._id);
    expect(bed.status).toBe('OCCUPIED');
    expect(String(bed.currentAdmission)).toBe(String(adm2._id));
  }));

  it('frees the bed when an admission is cancelled', () => inTenant(async () => {
    const adm = await ipdService.admitPatient(admitData(ctx.p1, ctx.bedA), null);
    await ipdService.cancelAdmission(adm._id);

    const bed = await Bed.findById(ctx.bedA._id);
    expect(bed.status).toBe('AVAILABLE');
    expect(bed.currentAdmission).toBeNull();
  }));
});
