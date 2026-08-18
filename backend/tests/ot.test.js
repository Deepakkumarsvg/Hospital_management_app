// Theatre scheduling integrity.
//
// The invariant: a theatre never holds two active surgeries whose time windows
// overlap — including when two bookings are made at the same instant, which the
// service-layer check alone cannot prevent.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb, inTenant } from './helpers.js';

const { Surgery, surgerySlots } = await import('../src/models/Surgery.js');
const { OperationTheatre } = await import('../src/models/OperationTheatre.js');
const { Patient } = await import('../src/models/Patient.js');
const { Doctor } = await import('../src/models/Doctor.js');
const { Department } = await import('../src/models/Department.js');
const ot = await import('../src/services/otService.js');

let theatre; let otherTheatre; let patient; let surgeon;

beforeAll(async () => { await connectTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

beforeEach(async () => {
  await inTenant(async () => {
    await Promise.all([
      Surgery.deleteMany({}), OperationTheatre.deleteMany({}),
      Patient.deleteMany({}), Doctor.deleteMany({}), Department.deleteMany({}),
    ]);
    // The concurrency guarantee rests entirely on the unique slot index.
    await Surgery.syncIndexes();

    const dept = await Department.create({ name: 'Surgery', code: 'SURG' });
    [theatre, otherTheatre] = await OperationTheatre.create([
      { name: 'OT-1', code: 'OT1' },
      { name: 'OT-2', code: 'OT2' },
    ]);
    patient = await Patient.create({
      firstName: 'Vikram', lastName: 'Nair', gender: 'MALE', dateOfBirth: '1980-05-02', phone: '9000000031',
    });
    surgeon = await Doctor.create({
      firstName: 'Meera', lastName: 'Iyer', registrationNo: 'REG-OT-001',
      specialization: 'General Surgery',
      department: dept._id, phone: '9000000032', email: 'meera@test.local',
    });
  });
});

// A 2-hour surgery on a fixed date, so overlap arithmetic stays obvious.
const booking = (overrides = {}) => ({
  patient: patient._id,
  theatre: theatre._id,
  surgeon: surgeon._id,
  procedure: 'Appendectomy',
  scheduledDate: new Date('2026-03-10T00:00:00'),
  scheduledTime: '10:00',
  estimatedDuration: 120,
  ...overrides,
});

describe('surgery slot derivation', () => {
  it('covers every bucket the surgery actually occupies', () => {
    const slots = surgerySlots({
      scheduledDate: new Date('2026-03-10T00:00:00'), scheduledTime: '10:00', estimatedDuration: 120,
    });
    expect(slots).toHaveLength(120 / 5); // 5-minute buckets
  });

  it('gives back-to-back surgeries disjoint buckets', () => {
    const first = surgerySlots({
      scheduledDate: new Date('2026-03-10T00:00:00'), scheduledTime: '10:00', estimatedDuration: 60,
    });
    const second = surgerySlots({
      scheduledDate: new Date('2026-03-10T00:00:00'), scheduledTime: '11:00', estimatedDuration: 60,
    });
    expect(first.filter((s) => second.includes(s))).toEqual([]);
  });

  it('runs a past-midnight surgery into the next day without renumbering', () => {
    const slots = surgerySlots({
      scheduledDate: new Date('2026-03-10T00:00:00'), scheduledTime: '23:30', estimatedDuration: 120,
    });
    expect(slots).toHaveLength(24);
    expect(new Set(slots).size).toBe(24); // no collisions with itself
  });
});

describe('theatre booking conflicts', () => {
  it('rejects an overlapping booking in the same theatre', () => inTenant(async () => {
    await ot.createSurgery(booking(), null);

    await expect(ot.createSurgery(booking({ scheduledTime: '11:00' }), null))
      .rejects.toMatchObject({ errorCode: 'THEATRE_CONFLICT' });
  }));

  it('allows a non-overlapping booking in the same theatre', () => inTenant(async () => {
    await ot.createSurgery(booking(), null);
    const second = await ot.createSurgery(booking({ scheduledTime: '12:00' }), null);
    expect(second.surgeryNo).toBeTruthy();
  }));

  it('allows the same window in a different theatre', () => inTenant(async () => {
    await ot.createSurgery(booking(), null);
    const second = await ot.createSurgery(booking({ theatre: otherTheatre._id }), null);
    expect(second.surgeryNo).toBeTruthy();
  }));

  it('never lets two simultaneous bookings take the same theatre slot', () => inTenant(async () => {
    // Three schedulers book overlapping windows at the same instant. The
    // service-layer check passes for all three; only the index can stop them.
    const results = await Promise.allSettled([
      ot.createSurgery(booking({ scheduledTime: '10:00' }), null),
      ot.createSurgery(booking({ scheduledTime: '10:30' }), null),
      ot.createSurgery(booking({ scheduledTime: '11:00' }), null),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results.filter((r) => r.status === 'rejected')) {
      expect(r.reason.errorCode).toBe('THEATRE_CONFLICT');
    }
    expect(await Surgery.countDocuments({ theatre: theatre._id })).toBe(1);
  }));

  it('frees the theatre once a surgery is cancelled', () => inTenant(async () => {
    const first = await ot.createSurgery(booking(), null);
    await ot.changeStatus(first._id, 'CANCELLED');

    const second = await ot.createSurgery(booking(), null);
    expect(second.surgeryNo).toBeTruthy();
  }));

  it('frees the theatre once a surgery is completed', () => inTenant(async () => {
    const first = await ot.createSurgery(booking(), null);
    await ot.changeStatus(first._id, 'IN_PROGRESS');
    await ot.changeStatus(first._id, 'COMPLETED');

    const second = await ot.createSurgery(booking(), null);
    expect(second.surgeryNo).toBeTruthy();
  }));

  it('lets a surgery be rescheduled without clashing with itself', () => inTenant(async () => {
    const s = await ot.createSurgery(booking(), null);
    const moved = await ot.updateSurgery(s._id, { scheduledTime: '10:30' });
    expect(moved.scheduledTime).toBe('10:30');
  }));

  it('refuses a reschedule onto another surgery', () => inTenant(async () => {
    const first = await ot.createSurgery(booking(), null);
    await ot.createSurgery(booking({ scheduledTime: '14:00' }), null);

    await expect(ot.updateSurgery(first._id, { scheduledTime: '14:30' }))
      .rejects.toMatchObject({ errorCode: 'THEATRE_CONFLICT' });
  }));
});
