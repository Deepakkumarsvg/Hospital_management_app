// The inpatient chart: observations over time, attributed notes, and a record
// of what was actually put into the patient.
//
// All three were missing in ways that matter. Vitals were a single field that
// overwrote itself, so deterioration — which is visible in the slope, not in
// any one reading — could not be seen. Notes had no author role and no
// distinction between a nurse and a consultant. And nothing recorded
// administration at all: the system knew what was prescribed and what left the
// pharmacy, but not what went into the patient, when, or by whom.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb, inTenant } from './helpers.js';

const {
  VitalsRecord, ClinicalNote, MedicationOrder, MedicationAdministration,
} = await import('../src/models/ClinicalRecord.js');
const { Patient } = await import('../src/models/Patient.js');
const { Doctor } = await import('../src/models/Doctor.js');
const { Department } = await import('../src/models/Department.js');
const clinical = await import('../src/services/clinicalService.js');

let patient; let doctor; let encounter;
const nurse = { _id: '000000000000000000000011', role: 'NURSE' };
const consultant = { _id: '000000000000000000000012', role: 'DOCTOR' };

const HOUR = 60 * 60 * 1000;

beforeAll(async () => { await connectTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

beforeEach(async () => {
  await inTenant(async () => {
    await Promise.all([
      VitalsRecord.deleteMany({}), ClinicalNote.deleteMany({}),
      MedicationOrder.deleteMany({}), MedicationAdministration.deleteMany({}),
      Patient.deleteMany({}), Doctor.deleteMany({}), Department.deleteMany({}),
    ]);
    await MedicationAdministration.syncIndexes();

    const dept = await Department.create({ name: 'Medicine', code: 'MED' });
    patient = await Patient.create({
      firstName: 'Meena', lastName: 'Joshi', gender: 'FEMALE',
      dateOfBirth: '1962-08-30', phone: '9000000111', allergies: 'Penicillin, Sulfa',
    });
    doctor = await Doctor.create({
      firstName: 'Vikas', lastName: 'Reddy', registrationNo: 'REG-CL-1',
      specialization: 'Internal Medicine', department: dept._id, phone: '9000000112',
    });
    encounter = '000000000000000000000099';
  });
});

const enc = () => ({ patient: patient._id, encounterType: 'IPD', encounter });

const vitals = (overrides = {}) => clinical.recordVitals({
  ...enc(), systolic: 120, diastolic: 80, pulse: 78, temperature: 98.4,
  spo2: 98, respiratoryRate: 16, ...overrides,
}, nurse._id);

describe('observations are a series, not a snapshot', () => {
  it('keeps every reading rather than overwriting the last', () => inTenant(async () => {
    await vitals({ systolic: 120, recordedAt: new Date(Date.now() - 4 * HOUR) });
    await vitals({ systolic: 108, recordedAt: new Date(Date.now() - 2 * HOUR) });
    await vitals({ systolic: 92 });

    const rows = await clinical.vitalsFor(encounter);
    expect(rows).toHaveLength(3);
    // Oldest first, so it reads as a trend rather than a stack.
    expect(rows.map((r) => r.systolic)).toEqual([120, 108, 92]);
  }));

  it('stores blood pressure as two numbers so it can be plotted', () => inTenant(async () => {
    const r = await vitals({ systolic: 130, diastolic: 85 });
    expect(r.systolic).toBe(130);
    expect(r.diastolic).toBe(85);
    expect(r.bp).toBe('130/85');
  }));

  it('gives a trend with the gaps left in', () => inTenant(async () => {
    // A missing reading is not a zero. Closing the gap would draw a line the
    // observations do not support.
    await vitals({ bloodSugar: 140 });
    await vitals({ bloodSugar: null });

    const { points } = await clinical.vitalsTrend(encounter);
    expect(points).toHaveLength(2);
    expect(points[0].bloodSugar).toBe(140);
    expect(points[1].bloodSugar).toBeNull();
  }));
});

describe('early warning score', () => {
  it('scores a normal set as zero', () => inTenant(async () => {
    const r = await vitals();
    expect(r.news2).toBe(0);
  }));

  it('adds up across components that each look survivable alone', () => inTenant(async () => {
    // The reason NEWS2 exists: nothing here is dramatic on its own, but
    // together they are a patient in trouble.
    const r = await vitals({ respiratoryRate: 22, spo2: 93, systolic: 100, pulse: 115, temperature: 96.5 });
    expect(r.news2).toBeGreaterThanOrEqual(7);
  }));

  it('refuses to score when too little was recorded', () => inTenant(async () => {
    // A partial score would read as reassurance the observations cannot give.
    const r = await vitals({ respiratoryRate: null, spo2: null, systolic: null, diastolic: null, pulse: null });
    expect(r.news2).toBeNull();
  }));
});

describe('clinical notes', () => {
  it('records who wrote it and in what role', () => inTenant(async () => {
    const note = await clinical.addNote({ ...enc(), noteType: 'PROGRESS', body: 'Ward round: stable.' }, consultant);
    // The role is snapshotted: a registrar who later becomes a consultant still
    // wrote that note as a registrar.
    expect(note.authorRole).toBe('DOCTOR');
    expect(note.isSigned).toBe(true);
  }));

  it('keeps nursing and medical entries apart', () => inTenant(async () => {
    await clinical.addNote({ ...enc(), noteType: 'PROGRESS', body: 'Plan: continue.' }, consultant);
    await clinical.addNote({ ...enc(), noteType: 'NURSING', body: 'Ate lunch.' }, nurse);

    expect(await clinical.notesFor(encounter, { noteType: 'PROGRESS' })).toHaveLength(1);
    expect(await clinical.notesFor(encounter)).toHaveLength(2);
  }));

  it('lets an unsigned draft be edited by its author', () => inTenant(async () => {
    const draft = await clinical.addNote({ ...enc(), noteType: 'PROGRESS', body: 'Initial', sign: false }, consultant);
    const edited = await clinical.amendNote(draft._id, { body: 'Corrected before signing' }, consultant._id);

    expect(edited.body).toBe('Corrected before signing');
    expect(edited.addenda).toHaveLength(0);
  }));

  it('turns a correction to a SIGNED note into an addendum', () => inTenant(async () => {
    // A record that can be rewritten after the fact is not evidence of
    // anything, so the original text stays and the correction is appended.
    const note = await clinical.addNote({ ...enc(), noteType: 'PROGRESS', body: 'BP 120/80' }, consultant);
    const amended = await clinical.amendNote(note._id, { body: 'Correction: BP was 100/60' }, consultant._id);

    expect(amended.body).toBe('BP 120/80');
    expect(amended.addenda).toHaveLength(1);
    expect(amended.addenda[0].body).toMatch(/Correction/);
  }));

  it('refuses to let somebody else edit a draft', () => inTenant(async () => {
    const draft = await clinical.addNote({ ...enc(), noteType: 'PROGRESS', body: 'Mine', sign: false }, consultant);
    await expect(clinical.amendNote(draft._id, { body: 'Not yours' }, nurse._id))
      .rejects.toMatchObject({ errorCode: 'NOTE_NOT_AUTHOR' });
  }));

  it('refuses to let somebody else sign a note', () => inTenant(async () => {
    const draft = await clinical.addNote({ ...enc(), noteType: 'PROGRESS', body: 'Mine', sign: false }, consultant);
    await expect(clinical.signNote(draft._id, nurse._id))
      .rejects.toMatchObject({ errorCode: 'NOTE_NOT_AUTHOR' });
  }));
});

describe('allergy matching', () => {
  it('matches a real allergy', () => {
    expect(clinical.matchAllergies('Penicillin, Sulfa', 'Penicillin 500mg')).toEqual(['penicillin']);
  });

  it('does not fire on a drug that merely contains the letters', () => {
    // The old check was name.includes(allergy), which reported "Cetirizine"
    // for an allergy recorded as "rice". A system that cries wolf is one whose
    // warnings get clicked through, which is worse than having none.
    expect(clinical.matchAllergies('rice', 'Cetirizine 10mg')).toEqual([]);
    expect(clinical.matchAllergies('Penicillin', 'Penicillamine 250mg')).toEqual([]);
  });

  it('ignores allergy entries too short to mean anything', () => {
    expect(clinical.matchAllergies('a, eg', 'Paracetamol')).toEqual([]);
  });
});

describe('prescribing', () => {
  const order = (overrides = {}) => clinical.prescribe({
    ...enc(), medicineName: 'Paracetamol', dose: '500 mg', route: 'ORAL',
    frequency: 'TDS', prescribedBy: doctor._id, ...overrides,
  }, consultant._id);

  it('creates an active order', () => inTenant(async () => {
    const o = await order();
    expect(o.status).toBe('ACTIVE');
    expect(o.frequency).toBe('TDS');
  }));

  it('refuses a drug the patient is recorded as allergic to', () => inTenant(async () => {
    await expect(order({ medicineName: 'Penicillin 500mg' }))
      .rejects.toMatchObject({ errorCode: 'ALLERGY_WARNING' });
  }));

  it('allows it with a reason, and records what the prescriber saw', () => inTenant(async () => {
    const o = await order({ medicineName: 'Penicillin 500mg', overrideReason: 'Mild rash only, benefit outweighs' });
    // The warning is stored as it stood at the moment of the decision, not
    // recomputed later against whatever the allergy list says by then.
    expect(o.allergyWarnings).toEqual(['penicillin']);
    expect(o.overrideReason).toMatch(/benefit outweighs/);
  }));

  it('stops an order once and refuses a second stop', () => inTenant(async () => {
    const o = await order();
    await clinical.stopOrder(o._id, { reason: 'Course complete' }, consultant._id);
    await expect(clinical.stopOrder(o._id, {}, consultant._id))
      .rejects.toMatchObject({ errorCode: 'MED_ORDER_CLOSED' });
  }));
});

describe('the drug chart', () => {
  const order = (overrides = {}) => clinical.prescribe({
    ...enc(), medicineName: 'Paracetamol', dose: '500 mg', route: 'ORAL',
    frequency: 'TDS', prescribedBy: doctor._id,
    startAt: new Date(new Date().setHours(0, 0, 0, 0)),
    ...overrides,
  }, consultant._id);

  it('lays out a slot for every dose due today', () => inTenant(async () => {
    await order();
    const chart = await clinical.marFor(encounter);
    expect(chart).toHaveLength(1);
    expect(chart[0].slots).toHaveLength(3); // TDS
  }));

  it('leaves as-required medicines without scheduled slots', () => inTenant(async () => {
    // SOS is given when needed, not on a timetable — inventing slots for it
    // would produce a chart full of doses nobody ever intended to give.
    await order({ frequency: 'SOS', medicineName: 'Ondansetron' });
    const chart = await clinical.marFor(encounter);
    expect(chart[0].slots).toHaveLength(0);
  }));

  it('marks a passed slot overdue only once its time has gone', () => inTenant(async () => {
    await order();
    const chart = await clinical.marFor(encounter);
    const now = new Date();

    for (const slot of chart[0].slots) {
      expect(slot.overdue).toBe(slot.scheduledFor < now);
    }
  }));

  it('records a dose against its slot', () => inTenant(async () => {
    const o = await order();
    const chart = await clinical.marFor(encounter);
    const slot = chart[0].slots[0];

    await clinical.administer(o._id, { scheduledFor: slot.scheduledFor, status: 'GIVEN' }, nurse._id);

    const after = await clinical.marFor(encounter);
    expect(after[0].slots[0].record.status).toBe('GIVEN');
    expect(after[0].slots[0].overdue).toBe(false);
  }));

  it('never lets the same dose be signed twice', () => inTenant(async () => {
    // Two nurses signing the same 08:00 dose must collide in the database
    // rather than both succeeding — that is the difference between a caught
    // duplicate and a double dose in the patient.
    const o = await order();
    const slot = (await clinical.marFor(encounter))[0].slots[0];

    const results = await Promise.allSettled([
      clinical.administer(o._id, { scheduledFor: slot.scheduledFor, status: 'GIVEN' }, nurse._id),
      clinical.administer(o._id, { scheduledFor: slot.scheduledFor, status: 'GIVEN' }, consultant._id),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected').reason.errorCode).toBe('MAR_ALREADY_RECORDED');
    expect(await MedicationAdministration.countDocuments({ order: o._id })).toBe(1);
  }));

  it('demands a reason for anything other than GIVEN', () => inTenant(async () => {
    // "Not given" with no reason is the entry that makes a chart useless in an
    // investigation.
    const o = await order();
    const slot = (await clinical.marFor(encounter))[0].slots[0];

    await expect(clinical.administer(o._id, { scheduledFor: slot.scheduledFor, status: 'REFUSED' }, nurse._id))
      .rejects.toMatchObject({ errorCode: 'MAR_REASON_REQUIRED' });

    const ok = await clinical.administer(o._id, {
      scheduledFor: slot.scheduledFor, status: 'REFUSED', reason: 'Patient declined',
    }, nurse._id);
    expect(ok.reason).toBe('Patient declined');
  }));

  it('refuses to administer a stopped medicine', () => inTenant(async () => {
    const o = await order();
    const slot = (await clinical.marFor(encounter))[0].slots[0];
    await clinical.stopOrder(o._id, { reason: 'Rash' }, consultant._id);

    await expect(clinical.administer(o._id, { scheduledFor: slot.scheduledFor, status: 'GIVEN' }, nurse._id))
      .rejects.toMatchObject({ errorCode: 'MED_ORDER_STOPPED' });
  }));

  it('reports doses that were neither given nor explained', () => inTenant(async () => {
    // The number a ward round actually asks for.
    await order({ startAt: new Date(Date.now() - 12 * HOUR) });
    const missed = await clinical.missedDoses(encounter);
    expect(missed.length).toBeGreaterThan(0);
    expect(missed.every((m) => m.scheduledFor <= new Date())).toBe(true);
  }));

  it('stops counting a dose as missed once it is accounted for', () => inTenant(async () => {
    const o = await order({ startAt: new Date(Date.now() - 12 * HOUR) });
    const before = await clinical.missedDoses(encounter);

    await clinical.administer(o._id, {
      scheduledFor: before[0].scheduledFor, status: 'OMITTED', reason: 'Nil by mouth for theatre',
    }, nurse._id);

    const after = await clinical.missedDoses(encounter);
    expect(after).toHaveLength(before.length - 1);
  }));
});
