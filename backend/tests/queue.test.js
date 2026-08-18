// The OPD queue.
//
// An appointment is a booking; a token is a position in today's line. Keeping
// them apart is the whole design: walk-ins have no appointment and are usually
// the majority, and somebody who booked for 10:00 and turned up at 11:30 is
// behind the people who arrived on time.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb, inTenant } from './helpers.js';

const { OpdToken, queueDayOf } = await import('../src/models/OpdToken.js');
const { Patient } = await import('../src/models/Patient.js');
const { Doctor } = await import('../src/models/Doctor.js');
const { Department } = await import('../src/models/Department.js');
const { Appointment } = await import('../src/models/Appointment.js');
const queue = await import('../src/services/queueService.js');

let patients; let doctor; let otherDoctor; let dept;

beforeAll(async () => { await connectTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

beforeEach(async () => {
  await inTenant(async () => {
    await Promise.all([
      OpdToken.deleteMany({}), Patient.deleteMany({}), Doctor.deleteMany({}),
      Department.deleteMany({}), Appointment.deleteMany({}),
    ]);
    await OpdToken.syncIndexes();

    dept = await Department.create({ name: 'General Medicine', code: 'GM' });
    [doctor, otherDoctor] = await Doctor.create([
      { firstName: 'Asha', lastName: 'Pillai', registrationNo: 'REG-Q-1', specialization: 'Medicine', department: dept._id, phone: '9000000121' },
      { firstName: 'Rohit', lastName: 'Shah', registrationNo: 'REG-Q-2', specialization: 'Medicine', department: dept._id, phone: '9000000122' },
    ]);

    patients = await Patient.create([
      { firstName: 'P', lastName: 'One', gender: 'MALE', dateOfBirth: '1990-01-01', phone: '9000000131' },
      { firstName: 'P', lastName: 'Two', gender: 'FEMALE', dateOfBirth: '1955-01-01', phone: '9000000132' },
      { firstName: 'P', lastName: 'Three', gender: 'MALE', dateOfBirth: '1988-01-01', phone: '9000000133' },
    ]);
  });
});

const issue = (patient, overrides = {}) =>
  queue.issueToken({ patient: patient._id, doctor: doctor._id, ...overrides }, null);

describe('issuing tokens', () => {
  it('numbers them from one, per doctor, per day', () => inTenant(async () => {
    const a = await issue(patients[0]);
    const b = await issue(patients[1]);
    expect(a.tokenNo).toBe(1);
    expect(a.tokenLabel).toBe('OPD-001');
    expect(b.tokenNo).toBe(2);
  }));

  it('keeps each doctor on their own sequence', () => inTenant(async () => {
    // The number tells a patient where they are in the line they are actually
    // standing in — a hospital-wide sequence would tell them nothing.
    await issue(patients[0]);
    const other = await queue.issueToken({ patient: patients[1]._id, doctor: otherDoctor._id }, null);
    expect(other.tokenNo).toBe(1);
  }));

  it('never hands the same number to two people', () => inTenant(async () => {
    const results = await Promise.allSettled([
      issue(patients[0]), issue(patients[1]), issue(patients[2]),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value.tokenNo);
    expect(ok).toHaveLength(3);
    expect(new Set(ok).size).toBe(3);
  }));

  it('refuses to queue the same patient twice', () => inTenant(async () => {
    // A patient in the line twice occupies two places and makes the wait
    // estimate wrong for everyone behind them.
    await issue(patients[0]);
    await expect(issue(patients[0])).rejects.toMatchObject({ errorCode: 'TOKEN_ALREADY_ISSUED' });
  }));

  it('lets them re-queue once their visit is finished', () => inTenant(async () => {
    const t = await issue(patients[0]);
    await queue.startConsultation(t._id);
    await queue.completeToken(t._id);

    const again = await issue(patients[0]);
    expect(again.tokenNo).toBe(2);
  }));

  it('marks a booked patient as a walk-in only when they had no booking', () => inTenant(async () => {
    const appt = await Appointment.create({
      patient: patients[0]._id, doctor: doctor._id, department: dept._id,
      date: new Date(), time: '10:00',
    });

    const booked = await issue(patients[0], { appointment: appt._id });
    const walkIn = await issue(patients[1]);

    expect(booked.type).toBe('APPOINTMENT');
    expect(walkIn.type).toBe('WALK_IN');
    // Turning up checks the booking in — leaving it BOOKED would have two
    // records disagreeing about where the patient is.
    expect((await Appointment.findById(appt._id)).status).toBe('CHECKED_IN');
  }));
});

describe('queue order', () => {
  it('serves in token order when nobody has priority', () => inTenant(async () => {
    await issue(patients[0]);
    await issue(patients[1]);
    const q = await queue.doctorQueue(doctor._id);
    expect(q.waiting.map((t) => t.tokenNo)).toEqual([1, 2]);
  }));

  it('puts a priority patient ahead of earlier tokens', () => inTenant(async () => {
    // Statutory priority, not a favour at the desk — which is why the reason
    // is recorded on the token.
    await issue(patients[0]);
    await issue(patients[1], { priority: 'SENIOR_CITIZEN' });
    await issue(patients[2]);

    const q = await queue.doctorQueue(doctor._id);
    expect(q.waiting[0].tokenNo).toBe(2);
    expect(q.waiting[0].priority).toBe('SENIOR_CITIZEN');
  }));

  it('puts a casualty referral ahead of other priorities', () => inTenant(async () => {
    await issue(patients[0], { priority: 'SENIOR_CITIZEN' });
    await issue(patients[1], { priority: 'EMERGENCY_REFERRAL' });

    const q = await queue.doctorQueue(doctor._id);
    expect(q.waiting[0].priority).toBe('EMERGENCY_REFERRAL');
  }));

  it('keeps token order within the same priority', () => inTenant(async () => {
    await issue(patients[0], { priority: 'SENIOR_CITIZEN' });
    await issue(patients[1], { priority: 'SENIOR_CITIZEN' });

    const q = await queue.doctorQueue(doctor._id);
    expect(q.waiting.map((t) => t.tokenNo)).toEqual([1, 2]);
  }));
});

describe('running the room', () => {
  it('calls whoever is at the front', () => inTenant(async () => {
    await issue(patients[0]);
    await issue(patients[1], { priority: 'SENIOR_CITIZEN' });

    const called = await queue.callNext(doctor._id, null, null);
    expect(called.tokenNo).toBe(2);
    expect(called.status).toBe('CALLED');
  }));

  it('never calls two people to the same room', () => inTenant(async () => {
    await issue(patients[0]);
    await issue(patients[1]);

    const [a, b] = await Promise.all([
      queue.callNext(doctor._id, null, null),
      queue.callNext(doctor._id, null, null),
    ]);
    // Both calls succeed — but they must be different patients, not the same
    // one called twice.
    expect(a.tokenNo).not.toBe(b.tokenNo);
  }));

  it('says so plainly when nobody is waiting', () => inTenant(async () => {
    await expect(queue.callNext(doctor._id, null, null))
      .rejects.toMatchObject({ errorCode: 'QUEUE_EMPTY' });
  }));

  it('walks a token through to completion', () => inTenant(async () => {
    const t = await issue(patients[0]);
    await queue.callToken(t._id, null);
    const started = await queue.startConsultation(t._id);
    expect(started.status).toBe('IN_CONSULTATION');
    expect(started.startedAt).toBeTruthy();

    const done = await queue.completeToken(t._id);
    expect(done.status).toBe('COMPLETED');
    expect(done.consultationMinutes).not.toBeNull();
  }));

  it('lets a skipped patient be recalled on their original number', () => inTenant(async () => {
    // They stepped out for a moment. Sending them to the back of a queue they
    // already waited in would be a punishment, not a process.
    const t = await issue(patients[0]);
    await queue.callToken(t._id, null);
    await queue.skipToken(t._id, 'No response');

    const recalled = await queue.callToken(t._id, null);
    expect(recalled.status).toBe('CALLED');
    expect(recalled.tokenNo).toBe(t.tokenNo);
  }));

  it('drops a completed token off the waiting list', () => inTenant(async () => {
    const t = await issue(patients[0]);
    await queue.startConsultation(t._id);
    await queue.completeToken(t._id);

    const q = await queue.doctorQueue(doctor._id);
    expect(q.waiting).toHaveLength(0);
    expect(q.counts.completed).toBe(1);
  }));
});

describe('the display board', () => {
  it('shows the number being seen and the next few, with no names', () => inTenant(async () => {
    const a = await issue(patients[0]);
    await issue(patients[1]);
    await issue(patients[2]);
    await queue.callToken(a._id, null);

    const board = await queue.displayBoard();
    expect(board).toHaveLength(1);
    expect(board[0].nowServing).toBe('OPD-001');
    expect(board[0].next).toEqual(['OPD-002', 'OPD-003']);

    // A public screen is not the place for patient names.
    expect(JSON.stringify(board)).not.toContain('One');
    expect(JSON.stringify(board)).not.toContain('9000000131');
  }));
});

describe('queue performance', () => {
  it('reports waiting and consultation time separately', () => inTenant(async () => {
    // A long wait with short consultations is a scheduling problem; a long
    // wait with long ones is a capacity problem. One combined average would
    // hide which.
    const t = await issue(patients[0]);
    await queue.startConsultation(t._id);
    await queue.completeToken(t._id);

    const stats = await queue.queueStats();
    expect(stats.issued).toBe(1);
    expect(stats.completed).toBe(1);
    expect(stats.avgWaitMinutes).not.toBeNull();
    expect(stats.avgConsultationMinutes).not.toBeNull();
  }));

  it('counts walk-ins apart from bookings', () => inTenant(async () => {
    const appt = await Appointment.create({
      patient: patients[0]._id, doctor: doctor._id, department: dept._id,
      date: new Date(), time: '11:00',
    });
    await issue(patients[0], { appointment: appt._id });
    await issue(patients[1]);

    const stats = await queue.queueStats();
    expect(stats.booked).toBe(1);
    expect(stats.walkIns).toBe(1);
  }));

  it('starts a fresh sequence the next day', () => inTenant(async () => {
    const today = await issue(patients[0]);
    expect(today.queueDay).toBe(queueDayOf());

    // Yesterday's queue is a different queue, and its numbers do not carry over.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const old = await queue.issueToken({
      patient: patients[1]._id, doctor: doctor._id, issuedAt: yesterday,
    }, null);

    expect(old.queueDay).toBe(queueDayOf(yesterday));
    expect(old.tokenNo).toBe(1);
  }));
});
