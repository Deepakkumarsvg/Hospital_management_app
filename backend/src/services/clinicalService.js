import {
  VitalsRecord, ClinicalNote, MedicationOrder, MedicationAdministration,
  MED_FREQUENCIES, VITAL_FIELDS,
} from '../models/ClinicalRecord.js';
import { Patient } from '../models/Patient.js';
import { Doctor } from '../models/Doctor.js';
import { ApiError } from '../utils/ApiError.js';
import { notify } from './notificationService.js';

// ---------------------------------------------------------------------------
// Vitals
// ---------------------------------------------------------------------------

export async function recordVitals(data, userId) {
  const patient = await Patient.exists({ _id: data.patient });
  if (!patient) throw ApiError.badRequest('Patient does not exist', 'PATIENT_NOT_FOUND');

  const record = await VitalsRecord.create({ ...data, recordedBy: userId });

  // A NEWS2 of 7 or more is the threshold at which most wards escalate. The
  // point of computing the score is that somebody is told — a number sitting
  // in a chart nobody opens has not helped anyone.
  if (record.news2 !== null && record.news2 >= 7) {
    notify({
      role: 'DOCTOR',
      type: 'CLINICAL',
      title: 'Deteriorating patient',
      message: `NEWS2 ${record.news2} recorded — urgent review needed`,
      link: `/ipd/${record.encounter}`,
    });
  }

  return record.populate('recordedBy', 'name');
}

// The observation chart for one encounter, oldest first so it reads as a trend.
export async function vitalsFor(encounterId, { limit = 200 } = {}) {
  const rows = await VitalsRecord.find({ encounter: encounterId })
    .populate('recordedBy', 'name')
    .sort({ recordedAt: 1 })
    .limit(limit);
  return rows;
}

// The series a chart actually plots: one array per measurement, with the gaps
// left in rather than closed up.
//
// A missing reading is not a zero, and joining across it would draw a line the
// observations do not support — so nulls are preserved and the client decides
// whether to break the line or interpolate.
export async function vitalsTrend(encounterId) {
  const rows = await VitalsRecord.find({ encounter: encounterId }).sort({ recordedAt: 1 }).lean({ virtuals: true });

  return {
    points: rows.map((r) => ({
      at: r.recordedAt,
      ...Object.fromEntries(VITAL_FIELDS.map((f) => [f, r[f] ?? null])),
      news2: r.news2 ?? null,
    })),
    latest: rows.length ? rows[rows.length - 1] : null,
  };
}

// ---------------------------------------------------------------------------
// Clinical notes
// ---------------------------------------------------------------------------

export async function addNote(data, user) {
  const patient = await Patient.exists({ _id: data.patient });
  if (!patient) throw ApiError.badRequest('Patient does not exist', 'PATIENT_NOT_FOUND');

  const note = await ClinicalNote.create({
    ...data,
    author: user._id,
    // Snapshot: roles change, and a note written by a registrar who later
    // became a consultant was still written by a registrar.
    authorRole: user.role,
    // A note written and signed in one action is the normal case; leaving it
    // unsigned is what a draft looks like.
    signedAt: data.sign === false ? null : new Date(),
  });
  return note.populate('author', 'name role');
}

export async function signNote(id, userId) {
  const note = await ClinicalNote.findById(id);
  if (!note) throw ApiError.notFound('Note not found', 'NOTE_NOT_FOUND');
  if (note.signedAt) throw ApiError.badRequest('This note is already signed', 'NOTE_SIGNED');
  if (String(note.author) !== String(userId)) {
    throw ApiError.forbidden('Only the author can sign their own note', 'NOTE_NOT_AUTHOR');
  }

  note.signedAt = new Date();
  await note.save();
  return note.populate('author', 'name role');
}

// Amend a note.
//
// An unsigned draft can still be edited. A signed one cannot — corrections go
// in as an addendum, because a medical record that can be rewritten after the
// fact is not evidence of anything.
export async function amendNote(id, { body }, userId) {
  const note = await ClinicalNote.findById(id);
  if (!note) throw ApiError.notFound('Note not found', 'NOTE_NOT_FOUND');

  if (!note.signedAt) {
    if (String(note.author) !== String(userId)) {
      throw ApiError.forbidden('Only the author can edit their own draft', 'NOTE_NOT_AUTHOR');
    }
    note.body = body;
    await note.save();
    return note.populate('author', 'name role');
  }

  note.addenda.push({ body, author: userId });
  await note.save();
  return note.populate([{ path: 'author', select: 'name role' }, { path: 'addenda.author', select: 'name role' }]);
}

export async function notesFor(encounterId, { noteType } = {}) {
  const filter = { encounter: encounterId };
  if (noteType && noteType !== 'ALL') filter.noteType = noteType;

  return ClinicalNote.find(filter)
    .populate([{ path: 'author', select: 'name role' }, { path: 'addenda.author', select: 'name role' }])
    .sort({ authoredAt: -1 });
}

// ---------------------------------------------------------------------------
// Medication orders
// ---------------------------------------------------------------------------

// Flag a prescription against what the patient is recorded as reacting to.
//
// The match is on whole words rather than substrings. The old check used
// `name.includes(allergy)`, which reports "Cetirizine" for an allergy recorded
// as "rice" — and a system that cries wolf is one whose warnings get clicked
// through, which is worse than having none.
export function matchAllergies(allergyText, medicineName) {
  const allergies = String(allergyText || '')
    .split(/[,;\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 3); // "eg" and "a" match everything

  const name = String(medicineName || '').toLowerCase();
  const words = name.split(/[^a-z]+/).filter(Boolean);

  return allergies.filter((allergy) => {
    const allergyWords = allergy.split(/[^a-z]+/).filter(Boolean);
    // Every word of the recorded allergy has to appear as a word of the drug
    // name — so "penicillin" matches "Penicillin 500mg" but not "Penicillamine".
    return allergyWords.every((w) => words.includes(w));
  });
}

export async function prescribe(data, userId) {
  const [patient, doctor] = await Promise.all([
    Patient.findById(data.patient).select('allergies'),
    Doctor.exists({ _id: data.prescribedBy }),
  ]);
  if (!patient) throw ApiError.badRequest('Patient does not exist', 'PATIENT_NOT_FOUND');
  if (!doctor) throw ApiError.badRequest('Doctor does not exist', 'DOCTOR_NOT_FOUND');

  const warnings = matchAllergies(patient.allergies, data.medicineName);
  if (warnings.length && !data.overrideReason) {
    throw ApiError.badRequest(
      `${data.medicineName} clashes with a recorded allergy (${warnings.join(', ')}). Give a reason to override.`,
      'ALLERGY_WARNING',
      { warnings }
    );
  }

  const order = await MedicationOrder.create({
    ...data,
    // The warning as it stood when the decision was made, not as recomputed
    // later against whatever the allergy list says today.
    allergyWarnings: warnings,
    createdBy: userId,
  });
  return order.populate('prescribedBy', 'firstName lastName');
}

export async function stopOrder(id, { reason }, userId) {
  const order = await MedicationOrder.findOneAndUpdate(
    { _id: id, status: { $in: ['ACTIVE', 'HELD'] } },
    { status: 'STOPPED', stoppedAt: new Date(), stoppedBy: userId, stopReason: reason || '' },
    { new: true }
  );
  if (!order) {
    const exists = await MedicationOrder.exists({ _id: id });
    if (!exists) throw ApiError.notFound('Order not found', 'MED_ORDER_NOT_FOUND');
    throw ApiError.badRequest('This order is no longer active', 'MED_ORDER_CLOSED');
  }
  return order;
}

export async function holdOrder(id, hold) {
  const order = await MedicationOrder.findOneAndUpdate(
    { _id: id, status: { $in: ['ACTIVE', 'HELD'] } },
    { status: hold ? 'HELD' : 'ACTIVE' },
    { new: true }
  );
  if (!order) throw ApiError.badRequest('This order is no longer active', 'MED_ORDER_CLOSED');
  return order;
}

// ---------------------------------------------------------------------------
// The MAR itself
// ---------------------------------------------------------------------------

// The dose times an order falls due on a given day.
export function dueTimesFor(order, day = new Date()) {
  const schedule = MED_FREQUENCIES[order.frequency];
  if (!schedule) return [];

  // STAT is one dose when it was written; SOS has no schedule at all — it is
  // given when needed, and recorded when it is.
  if (order.frequency === 'STAT') {
    const start = new Date(order.startAt);
    return isSameDay(start, day) ? [start] : [];
  }
  if (order.frequency === 'SOS') return [];

  return schedule.times.map((hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    const at = new Date(day);
    at.setHours(h, m, 0, 0);
    return at;
  }).filter((at) => {
    // Nothing is due before the order started or after it was stopped.
    if (at < new Date(order.startAt)) return false;
    const end = order.stoppedAt || order.endAt;
    return !end || at <= new Date(end);
  });
}

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// The drug chart for one day: every active order, every slot it falls due,
// and what was recorded against each.
//
// This is the screen a nurse works from, so it is assembled server-side —
// deriving "which doses are outstanding right now" in the client would mean
// two implementations of the rule that decides whether a patient got their
// medicine.
export async function marFor(encounterId, day = new Date()) {
  const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);

  const [orders, given] = await Promise.all([
    MedicationOrder.find({ encounter: encounterId, status: { $ne: 'COMPLETED' } })
      .populate('prescribedBy', 'firstName lastName')
      .sort({ createdAt: 1 }),
    MedicationAdministration.find({
      encounter: encounterId,
      scheduledFor: { $gte: dayStart, $lt: dayEnd },
    }).populate('administeredBy', 'name'),
  ]);

  const byKey = new Map(given.map((g) => [`${g.order}::${new Date(g.scheduledFor).toISOString()}`, g]));
  const now = new Date();

  return orders.map((order) => {
    const slots = dueTimesFor(order, dayStart).map((at) => {
      const record = byKey.get(`${order._id}::${at.toISOString()}`) || null;
      return {
        scheduledFor: at,
        record,
        // A dose is only "missed" once its time has passed with nothing
        // recorded — before that it is simply not due yet, and colouring it as
        // a failure would train people to ignore the colour.
        overdue: !record && at < now,
      };
    });

    // An as-required medicine has no timetable, so there is nothing to lay out
    // in advance — what matters is simply what was given, in the order it was.
    const asRequired = order.frequency === 'SOS'
      ? given
          .filter((g) => String(g.order) === String(order._id))
          .sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor))
      : [];

    return { order, slots, asRequired };
  });
}

// Sign for a dose.
//
// The unique index on (order, scheduledFor) is what makes this safe: two
// nurses signing the same 08:00 dose collide in the database rather than both
// succeeding, which is the difference between a caught duplicate and a double
// dose in the patient.
export async function administer(orderId, data, userId) {
  const order = await MedicationOrder.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found', 'MED_ORDER_NOT_FOUND');
  if (order.status === 'STOPPED') {
    throw ApiError.badRequest('This medicine has been stopped', 'MED_ORDER_STOPPED');
  }
  if (order.status === 'HELD') {
    throw ApiError.badRequest('This medicine is on hold', 'MED_ORDER_HELD');
  }

  // Anything other than a dose actually going in has to say why. "Not given"
  // with no reason is the entry that makes a chart useless in an investigation.
  if (data.status !== 'GIVEN' && !data.reason?.trim()) {
    throw ApiError.badRequest('Say why the dose was not given', 'MAR_REASON_REQUIRED');
  }

  try {
    const record = await MedicationAdministration.create({
      order: order._id,
      patient: order.patient,
      encounterType: order.encounterType,
      encounter: order.encounter,
      scheduledFor: data.scheduledFor,
      administeredAt: data.status === 'GIVEN' ? (data.administeredAt || new Date()) : null,
      administeredBy: userId,
      status: data.status,
      reason: data.reason || '',
      doseGiven: data.doseGiven || '',
      notes: data.notes || '',
    });
    return record.populate('administeredBy', 'name');
  } catch (err) {
    if (err?.code === 11000) {
      throw ApiError.conflict(
        'This dose has already been signed for',
        'MAR_ALREADY_RECORDED',
        { scheduledFor: data.scheduledFor }
      );
    }
    throw err;
  }
}

// Doses that fell due and were never accounted for.
//
// The measure a ward round asks for: not "how many were given" but "how many
// were neither given nor explained".
export async function missedDoses(encounterId, { since } = {}) {
  const from = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const now = new Date();

  const orders = await MedicationOrder.find({ encounter: encounterId, status: 'ACTIVE' });
  const recorded = await MedicationAdministration.find({
    encounter: encounterId,
    scheduledFor: { $gte: from, $lte: now },
  }).select('order scheduledFor');

  const done = new Set(recorded.map((r) => `${r.order}::${new Date(r.scheduledFor).toISOString()}`));
  const missed = [];

  for (const order of orders) {
    // Walk each day in the window rather than only today, so a dose missed
    // overnight is still reported in the morning.
    for (let d = new Date(from); d <= now; d.setDate(d.getDate() + 1)) {
      for (const at of dueTimesFor(order, new Date(d))) {
        if (at < from || at > now) continue;
        if (done.has(`${order._id}::${at.toISOString()}`)) continue;
        missed.push({ order, scheduledFor: at });
      }
    }
  }
  return missed.sort((a, b) => a.scheduledFor - b.scheduledFor);
}
