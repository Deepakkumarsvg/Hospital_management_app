// Slot-exclusivity guarantees.
//
// assertSlotFree() reads before it writes, so on its own it cannot stop two
// simultaneous bookings. The partial unique indexes on Appointment are what
// actually enforce the rule; these tests exercise the racing path, not just
// the sequential one.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb, inTenant } from './helpers.js';

const { Appointment } = await import('../src/models/Appointment.js');
const { Patient } = await import('../src/models/Patient.js');
const { Doctor } = await import('../src/models/Doctor.js');
const { Department } = await import('../src/models/Department.js');
const appointments = await import('../src/services/appointmentService.js');

let ctx = {};

beforeAll(async () => { await connectTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

beforeEach(async () => {
  await inTenant(async () => {
    await Promise.all([
      Appointment.deleteMany({}), Patient.deleteMany({}), Doctor.deleteMany({}), Department.deleteMany({}),
    ]);
    // The unique slot indexes must exist before the racing tests run.
    await Appointment.syncIndexes();

    const dept = await Department.create({ name: 'Cardiology', code: 'CARD' });
    const [d1, d2] = await Promise.all([
      Doctor.create({ firstName: 'Ravi', lastName: 'Kumar', gender: 'MALE', phone: '9000000010', registrationNo: 'REG-010', department: dept._id, specialization: 'Cardiologist' }),
      Doctor.create({ firstName: 'Meera', lastName: 'Nair', gender: 'FEMALE', phone: '9000000011', registrationNo: 'REG-011', department: dept._id, specialization: 'Cardiologist' }),
    ]);
    const [p1, p2] = await Promise.all([
      Patient.create({ firstName: 'Asha', lastName: 'Rao', gender: 'FEMALE', dateOfBirth: '1990-01-01', phone: '9000000012' }),
      Patient.create({ firstName: 'Bala', lastName: 'Iyer', gender: 'MALE', dateOfBirth: '1985-01-01', phone: '9000000013' }),
    ]);
    ctx = { dept, d1, d2, p1, p2 };
  });
});

const SLOT = { date: new Date('2026-09-10T00:00:00'), time: '10:30' };
const booking = (patient, doctor, over = {}) => ({
  patient: patient._id, doctor: doctor._id, department: ctx.dept._id, ...SLOT, ...over,
});

describe('appointment slot exclusivity', () => {
  it('lets only one of two concurrent bookings take a doctor slot', () => inTenant(async () => {
    const results = await Promise.allSettled([
      appointments.createAppointment(booking(ctx.p1, ctx.d1), null),
      appointments.createAppointment(booking(ctx.p2, ctx.d1), null),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected').reason.errorCode).toBe('SLOT_TAKEN');
    expect(await Appointment.countDocuments({ doctor: ctx.d1._id, time: SLOT.time })).toBe(1);
  }));

  it('lets only one of two concurrent bookings take a patient slot', () => inTenant(async () => {
    const results = await Promise.allSettled([
      appointments.createAppointment(booking(ctx.p1, ctx.d1), null),
      appointments.createAppointment(booking(ctx.p1, ctx.d2), null),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected').reason.errorCode).toBe('PATIENT_SLOT_TAKEN');
  }));

  it('frees the slot once the appointment is cancelled', () => inTenant(async () => {
    const first = await appointments.createAppointment(booking(ctx.p1, ctx.d1), null);
    await appointments.changeStatus(first._id, 'CANCELLED');

    // Same doctor, same slot — must be bookable again.
    const second = await appointments.createAppointment(booking(ctx.p2, ctx.d1), null);
    expect(second.status).toBe('BOOKED');
  }));

  it('treats the same day sent with and without a time component as one slot', () => inTenant(async () => {
    await appointments.createAppointment(booking(ctx.p1, ctx.d1, { date: new Date('2026-09-10T00:00:00') }), null);

    // A client sending a mid-day timestamp means the same calendar slot.
    await expect(appointments.createAppointment(
      booking(ctx.p2, ctx.d1, { date: new Date('2026-09-10T09:15:00') }), null
    )).rejects.toMatchObject({ errorCode: 'SLOT_TAKEN' });
  }));

  it('blocks a reschedule onto an occupied slot', () => inTenant(async () => {
    await appointments.createAppointment(booking(ctx.p1, ctx.d1), null);
    const other = await appointments.createAppointment(booking(ctx.p2, ctx.d1, { time: '11:00' }), null);

    await expect(appointments.updateAppointment(other._id, { time: SLOT.time }))
      .rejects.toMatchObject({ errorCode: 'SLOT_TAKEN' });
  }));

  it('allows rescheduling an appointment onto a free slot', () => inTenant(async () => {
    const appt = await appointments.createAppointment(booking(ctx.p1, ctx.d1), null);
    const moved = await appointments.updateAppointment(appt._id, { time: '15:45' });
    expect(moved.time).toBe('15:45');
    expect(moved.slotDay).toBe('2026-09-10');
  }));
});
