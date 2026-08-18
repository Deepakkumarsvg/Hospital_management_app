// Casualty.
//
// The three things that make this a different problem from OPD, and therefore
// the three things worth pinning down: the queue is ordered by acuity rather
// than by arrival, a patient can be treated before anyone knows who they are,
// and certain presentations carry a statutory reporting duty.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb, inTenant } from './helpers.js';

const { EmergencyVisit } = await import('../src/models/EmergencyVisit.js');
const { Patient } = await import('../src/models/Patient.js');
const { Doctor } = await import('../src/models/Doctor.js');
const { Department } = await import('../src/models/Department.js');
const { Ward } = await import('../src/models/Ward.js');
const { Room } = await import('../src/models/Room.js');
const { Bed } = await import('../src/models/Bed.js');
const { IPDAdmission } = await import('../src/models/IPDAdmission.js');
const er = await import('../src/services/emergencyService.js');

let patient; let doctor; let dept; let bed;

const MINUTE = 60 * 1000;
const agoMinutes = (n) => new Date(Date.now() - n * MINUTE);

beforeAll(async () => { await connectTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

beforeEach(async () => {
  await inTenant(async () => {
    await Promise.all([
      EmergencyVisit.deleteMany({}), Patient.deleteMany({}), Doctor.deleteMany({}),
      Department.deleteMany({}), Ward.deleteMany({}), Room.deleteMany({}),
      Bed.deleteMany({}), IPDAdmission.deleteMany({}),
    ]);

    dept = await Department.create({ name: 'Emergency', code: 'EMG' });
    const ward = await Ward.create({ name: 'ICU', code: 'ICU', type: 'ICU' });
    const room = await Room.create({ ward: ward._id, roomNo: '1' });
    bed = await Bed.create({ ward: ward._id, room: room._id, bedNo: 'ICU-1', dailyCharge: 5000 });

    patient = await Patient.create({
      firstName: 'Arun', lastName: 'Nair', gender: 'MALE',
      dateOfBirth: '1970-04-12', phone: '9000000101',
    });
    doctor = await Doctor.create({
      firstName: 'Priya', lastName: 'Menon', registrationNo: 'REG-ER-1',
      specialization: 'Emergency Medicine', department: dept._id, phone: '9000000102',
    });
  });
});

const arrive = (overrides = {}) => er.registerArrival({
  patient: patient._id,
  chiefComplaint: 'Chest pain',
  ...overrides,
}, null);

const unknownArrival = (overrides = {}) => er.registerArrival({
  patient: null,
  unidentified: { gender: 'MALE', estimatedAge: 40, broughtBy: 'Police', ...overrides },
  chiefComplaint: 'Unresponsive, road traffic accident',
  arrivalMode: 'AMBULANCE',
}, null);

describe('registering an arrival', () => {
  it('opens a chart for a known patient', () => inTenant(async () => {
    const visit = await arrive();
    expect(visit.erNo).toMatch(/^ER-\d{4}-\d{6}$/);
    expect(visit.status).toBe('WAITING');
  }));

  it('opens a chart for somebody with no identity at all', () => inTenant(async () => {
    // The case the module exists for: treatment starts before the paperwork.
    const visit = await unknownArrival();
    expect(visit.patient).toBeNull();
    expect(visit.unidentified.alias).toMatch(/^Unknown \d+$/);
  }));

  it('gives each unidentified arrival a distinct alias', () => inTenant(async () => {
    // Two unknown males in one shift must not both be "unknown male".
    const [a, b] = [await unknownArrival(), await unknownArrival()];
    expect(a.unidentified.alias).not.toBe(b.unidentified.alias);
  }));

  it('refuses a visit that is neither identified nor marked unidentified', () => inTenant(async () => {
    await expect(er.registerArrival({ chiefComplaint: 'Fever' }, null))
      .rejects.toMatchObject({ errorCode: 'ER_IDENTITY_REQUIRED' });
  }));

  it('refuses a visit claiming to be both', () => inTenant(async () => {
    await expect(er.registerArrival({
      patient: patient._id, unidentified: { gender: 'MALE' }, chiefComplaint: 'Fever',
    }, null)).rejects.toMatchObject({ errorCode: 'ER_IDENTITY_AMBIGUOUS' });
  }));
});

describe('the queue is ordered by acuity, not arrival', () => {
  it('puts the sicker patient first even though they arrived later', () => inTenant(async () => {
    const waiting = await arrive({ chiefComplaint: 'Sprained ankle', arrivalTime: agoMinutes(120) });
    await er.triage(waiting._id, { level: 5 }, null);

    const critical = await arrive({ chiefComplaint: 'Cardiac arrest', arrivalTime: agoMinutes(2) });
    await er.triage(critical._id, { level: 1 }, null);

    const q = await er.queue();
    expect(q[0].erNo).toBe(critical.erNo);
    expect(q[1].erNo).toBe(waiting.erNo);
  }));

  it('breaks ties within a level by who has waited longest', () => inTenant(async () => {
    const earlier = await arrive({ arrivalTime: agoMinutes(50) });
    const later = await arrive({ arrivalTime: agoMinutes(10) });
    await er.triage(earlier._id, { level: 3 }, null);
    await er.triage(later._id, { level: 3 }, null);

    const q = await er.queue();
    expect(q.map((v) => v.erNo)).toEqual([earlier.erNo, later.erNo]);
  }));

  it('puts an untriaged patient ahead of everyone', () => inTenant(async () => {
    // Someone nobody has assessed yet is an unknown risk, and an unknown risk
    // is the one you look at next.
    const triaged = await arrive({ arrivalTime: agoMinutes(60) });
    await er.triage(triaged._id, { level: 2 }, null);
    const unassessed = await arrive({ arrivalTime: agoMinutes(1) });

    const q = await er.queue();
    expect(q[0].erNo).toBe(unassessed.erNo);
  }));

  it('drops a closed visit off the board', () => inTenant(async () => {
    const visit = await arrive();
    await er.triage(visit._id, { level: 4 }, null);
    await er.dispose(visit._id, { disposition: 'DISCHARGED' }, null);

    expect(await er.queue()).toHaveLength(0);
  }));
});

describe('triage', () => {
  it('records who assessed and when', () => inTenant(async () => {
    const visit = await er.triage((await arrive())._id, { level: 3 }, null);
    expect(visit.triagedAt).toBeTruthy();
    expect(visit.triageHistory).toHaveLength(1);
    expect(visit.triageHistory[0].reason).toBe('Initial triage');
  }));

  it('keeps the history when a patient deteriorates in the waiting room', () => inTenant(async () => {
    const visit = await arrive();
    await er.triage(visit._id, { level: 4 }, null);
    const worse = await er.triage(visit._id, { level: 1, reason: 'Collapsed in waiting area' }, null);

    // The escalation is the thing an incident review asks to see, so it is
    // appended rather than overwriting the original assessment.
    expect(worse.triageLevel).toBe(1);
    expect(worse.triageHistory).toHaveLength(2);
    expect(worse.triageHistory[1].reason).toMatch(/Collapsed/);
  }));

  it('does not restart the clock on re-triage', () => inTenant(async () => {
    // Door-to-doctor is measured from the door. A re-triage must not reset it,
    // or a slow department could hide its waits by re-assessing people.
    const visit = await arrive({ arrivalTime: agoMinutes(40) });
    const first = await er.triage(visit._id, { level: 4 }, null);
    const again = await er.triage(visit._id, { level: 2, reason: 'Deteriorating' }, null);

    expect(again.triagedAt.getTime()).toBe(first.triagedAt.getTime());
  }));

  it('refuses to triage a closed visit', () => inTenant(async () => {
    const visit = await arrive();
    await er.dispose(visit._id, { disposition: 'DISCHARGED' }, null);
    await expect(er.triage(visit._id, { level: 2 }, null))
      .rejects.toMatchObject({ errorCode: 'ER_CLOSED' });
  }));
});

describe('door-to-doctor time', () => {
  it('measures from arrival to the first clinician', () => inTenant(async () => {
    const visit = await arrive({ arrivalTime: agoMinutes(25) });
    await er.triage(visit._id, { level: 3 }, null);
    const seen = await er.startTreatment(visit._id, doctor._id);

    expect(seen.doorToDoctorMinutes).toBeGreaterThanOrEqual(24);
    expect(seen.doorToDoctorMinutes).toBeLessThanOrEqual(26);
    // Level 3 targets 30 minutes, so 25 met it.
    expect(seen.metTriageTarget).toBe(true);
  }));

  it('marks a breach when the target was missed', () => inTenant(async () => {
    const visit = await arrive({ arrivalTime: agoMinutes(45) });
    await er.triage(visit._id, { level: 2 }, null); // 10-minute target
    const seen = await er.startTreatment(visit._id, doctor._id);

    expect(seen.metTriageTarget).toBe(false);
  }));

  it('does not move once a second clinician takes over', () => inTenant(async () => {
    // firstSeenAt is the measurement; a measurement that gets rewritten when
    // the shift changes is not one.
    const visit = await arrive({ arrivalTime: agoMinutes(30) });
    const first = await er.startTreatment(visit._id, doctor._id);

    const other = await Doctor.create({
      firstName: 'Sanjay', lastName: 'Rao', registrationNo: 'REG-ER-2',
      specialization: 'Emergency Medicine', department: dept._id, phone: '9000000103',
    });
    const second = await er.startTreatment(visit._id, other._id);

    expect(second.firstSeenAt.getTime()).toBe(first.firstSeenAt.getTime());
    expect(String(second.attendingDoctor._id)).toBe(String(other._id));
  }));

  it('reports compliance per acuity level, not as one average', () => inTenant(async () => {
    // A department can have a good mean wait and still be failing its sickest
    // patients, which is the whole reason this is reported per level.
    const critical = await arrive({ arrivalTime: agoMinutes(40) });
    await er.triage(critical._id, { level: 1 }, null);
    await er.startTreatment(critical._id, doctor._id);

    const minor = await arrive({ arrivalTime: agoMinutes(5) });
    await er.triage(minor._id, { level: 5 }, null);
    await er.startTreatment(minor._id, doctor._id);

    const stats = await er.erStats();
    const l1 = stats.doorToDoctor.find((r) => r.level === 1);
    const l5 = stats.doorToDoctor.find((r) => r.level === 5);

    expect(l1.compliancePercent).toBe(0);   // 40 min against a 0-min target
    expect(l5.compliancePercent).toBe(100); // 5 min against a 120-min target
  }));
});

describe('identifying a patient later', () => {
  it('attaches a real patient without disturbing the clinical record', () => inTenant(async () => {
    const visit = await unknownArrival();
    await er.triage(visit._id, { level: 1 }, null);
    const alias = visit.unidentified.alias;

    const named = await er.identifyPatient(visit._id, patient._id);

    expect(String(named.patient._id)).toBe(String(patient._id));
    expect(named.triageLevel).toBe(1);
    // The alias stays: notes and wristbands written during the resuscitation
    // refer to it.
    expect(named.unidentified.alias).toBe(alias);
  }));

  it('refuses to re-identify a visit that already has a patient', () => inTenant(async () => {
    const visit = await arrive();
    await expect(er.identifyPatient(visit._id, patient._id))
      .rejects.toMatchObject({ errorCode: 'ER_ALREADY_IDENTIFIED' });
  }));
});

describe('medico-legal cases', () => {
  it('assigns an MLC number and records the police intimation', () => inTenant(async () => {
    const visit = await unknownArrival();
    const flagged = await er.flagMLC(visit._id, {
      nature: 'ROAD_TRAFFIC_ACCIDENT', policeStation: 'Andheri East',
    }, null);

    expect(flagged.isMLC).toBe(true);
    expect(flagged.mlc.mlcNo).toMatch(/^MLC-\d{4}-\d{5}$/);
    expect(flagged.mlc.informedAt).toBeTruthy();
  }));

  it('does not claim the police were informed when no station is named', () => inTenant(async () => {
    // Flagging a case and reporting it are two different acts, and the record
    // must not assert the second because somebody did the first.
    const flagged = await er.flagMLC((await unknownArrival())._id, { nature: 'ASSAULT' }, null);
    expect(flagged.isMLC).toBe(true);
    expect(flagged.mlc.informedAt).toBeNull();
  }));

  it('keeps the MLC number stable across later edits', () => inTenant(async () => {
    const visit = await unknownArrival();
    const first = await er.flagMLC(visit._id, { nature: 'ASSAULT' }, null);
    const updated = await er.flagMLC(visit._id, { nature: 'ASSAULT', policeStation: 'Bandra' }, null);

    expect(updated.mlc.mlcNo).toBe(first.mlc.mlcNo);
  }));

  it('produces the statutory register', () => inTenant(async () => {
    const visit = await unknownArrival();
    await er.flagMLC(visit._id, { nature: 'ROAD_TRAFFIC_ACCIDENT', policeStation: 'Andheri East' }, null);

    const rows = await er.mlcRegisterRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]['Police Station']).toBe('Andheri East');
    expect(rows[0].Nature).toBe('ROAD_TRAFFIC_ACCIDENT');
  }));
});

describe('disposition', () => {
  it('closes the visit with an outcome', () => inTenant(async () => {
    const visit = await arrive({ arrivalTime: agoMinutes(90) });
    const closed = await er.dispose(visit._id, { disposition: 'DISCHARGED', notes: 'Advised rest' }, null);

    expect(closed.status).toBe('CLOSED');
    expect(closed.disposition).toBe('DISCHARGED');
    expect(closed.waitingMinutes).toBeGreaterThanOrEqual(89);
  }));

  it('closes exactly once when two clinicians act together', () => inTenant(async () => {
    const visit = await arrive();
    const results = await Promise.allSettled([
      er.dispose(visit._id, { disposition: 'DISCHARGED' }, null),
      er.dispose(visit._id, { disposition: 'LAMA' }, null),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected').reason.errorCode).toBe('ER_CLOSED');
  }));

  it('creates the ward admission when the outcome is ADMITTED', () => inTenant(async () => {
    const visit = await arrive({ chiefComplaint: 'Chest pain' });
    await er.startTreatment(visit._id, doctor._id);

    const closed = await er.dispose(visit._id, {
      disposition: 'ADMITTED', department: dept._id, bed: bed._id,
    }, null);

    expect(closed.admission).toBeTruthy();
    const admission = await IPDAdmission.findById(closed.admission._id || closed.admission);
    expect(admission.reason).toBe('Chest pain');
    // The bed is really taken, not just referenced.
    expect((await Bed.findById(bed._id)).status).toBe('OCCUPIED');
  }));

  it('reopens the visit when the admission cannot be made', () => inTenant(async () => {
    // No free bed is the everyday case. The visit must not be left closed as
    // ADMITTED when nobody was admitted.
    await Bed.updateOne({ _id: bed._id }, { status: 'OCCUPIED' });

    const visit = await arrive();
    await er.startTreatment(visit._id, doctor._id);

    await expect(er.dispose(visit._id, {
      disposition: 'ADMITTED', department: dept._id, bed: bed._id,
    }, null)).rejects.toMatchObject({ errorCode: 'BED_UNAVAILABLE' });

    const after = await EmergencyVisit.findById(visit._id);
    expect(after.status).toBe('IN_TREATMENT');
    // The invariant that matters: the visit must not claim an outcome that
    // never happened.
    expect(after.disposition).toBeFalsy();
    expect(after.admission).toBeNull();
  }));

  it('refuses to admit somebody nobody has identified', () => inTenant(async () => {
    const visit = await unknownArrival();
    await expect(er.dispose(visit._id, {
      disposition: 'ADMITTED', department: dept._id, bed: bed._id,
    }, null)).rejects.toMatchObject({ errorCode: 'ER_ADMIT_NEEDS_IDENTITY' });

    // And the visit is still open, so they can be identified and admitted.
    expect((await EmergencyVisit.findById(visit._id)).status).toBe('IN_TREATMENT');
  }));

  it('counts outcomes for the department', () => inTenant(async () => {
    for (const d of ['DISCHARGED', 'DISCHARGED', 'LAMA']) {
      await er.dispose((await arrive())._id, { disposition: d }, null);
    }

    const { dispositions } = await er.erStats();
    expect(dispositions.find((d) => d.disposition === 'DISCHARGED').count).toBe(2);
    expect(dispositions.find((d) => d.disposition === 'LAMA').count).toBe(1);
  }));
});
