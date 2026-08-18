import { OpdToken, queueDayOf, priorityRank, PRIORITY_REASONS } from '../models/OpdToken.js';
import { Patient } from '../models/Patient.js';
import { Doctor } from '../models/Doctor.js';
import { Appointment } from '../models/Appointment.js';
import { ApiError } from '../utils/ApiError.js';

const POPULATE = [
  { path: 'patient', select: 'uhid firstName lastName phone dateOfBirth' },
  { path: 'doctor', select: 'firstName lastName specialization' },
  { path: 'department', select: 'name code' },
];

// The order patients are actually seen in.
//
// Priority first, then token number. This is the queue's whole contract, so it
// lives here rather than in whichever screen happens to render it — the wall
// display and the doctor's list must never disagree about who is next.
const queueOrder = (a, b) => {
  const pa = priorityRank(a.priority);
  const pb = priorityRank(b.priority);
  if (pa !== pb) return pa - pb;
  return a.tokenNo - b.tokenNo;
};

// Issue the next token for a doctor's queue today.
//
// The number is derived from what is already in the queue rather than from a
// shared counter, because the sequence has to restart every morning and be
// per doctor. Two desks issuing at the same instant collide on the unique
// index; the retry below picks up the number that actually got used.
export async function issueToken(data, userId) {
  const [patient, doctor] = await Promise.all([
    Patient.findById(data.patient).select('_id dateOfBirth'),
    Doctor.findById(data.doctor).select('_id department status'),
  ]);
  if (!patient) throw ApiError.badRequest('Patient does not exist', 'PATIENT_NOT_FOUND');
  if (!doctor) throw ApiError.badRequest('Doctor does not exist', 'DOCTOR_NOT_FOUND');
  if (doctor.status !== 'ACTIVE') throw ApiError.badRequest('Doctor is not active', 'DOCTOR_INACTIVE');

  const queueDay = queueDayOf(data.issuedAt);

  // One live token per patient per doctor per day. A patient who queues twice
  // by accident occupies two places and makes the wait estimate wrong for
  // everyone behind them.
  const existing = await OpdToken.findOne({
    patient: patient._id, doctor: doctor._id, queueDay,
    status: { $in: ['WAITING', 'CALLED', 'IN_CONSULTATION'] },
  });
  if (existing) {
    throw ApiError.conflict(
      `This patient is already in the queue as ${existing.tokenLabel}`,
      'TOKEN_ALREADY_ISSUED',
      { tokenLabel: existing.tokenLabel, tokenId: existing._id }
    );
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const last = await OpdToken.findOne({ doctor: doctor._id, queueDay }).sort({ tokenNo: -1 }).select('tokenNo');
    const tokenNo = (last?.tokenNo || 0) + 1;

    try {
      const token = await OpdToken.create({
        tokenNo,
        tokenLabel: `OPD-${String(tokenNo).padStart(3, '0')}`,
        queueDay,
        patient: patient._id,
        doctor: doctor._id,
        department: data.department || doctor.department,
        appointment: data.appointment || null,
        type: data.appointment ? 'APPOINTMENT' : 'WALK_IN',
        priority: data.priority || 'NONE',
        notes: data.notes || '',
        issuedBy: userId,
      });

      // A booking that has turned up is checked in — the queue is now the
      // authority on where that patient is, and leaving the appointment
      // BOOKED would have two records disagreeing.
      if (data.appointment) {
        await Appointment.findOneAndUpdate(
          { _id: data.appointment, status: 'BOOKED' },
          { status: 'CHECKED_IN' }
        ).catch(() => {});
      }

      return token.populate(POPULATE);
    } catch (err) {
      // Somebody else took this number between the read and the insert. Read
      // again and take the next one.
      if (err?.code === 11000 && attempt < 4) continue;
      throw err;
    }
  }
  throw ApiError.conflict('The queue is busy — try again', 'TOKEN_CONTENTION');
}

// One doctor's queue for a day, in the order patients will be seen.
export async function doctorQueue(doctorId, day) {
  const queueDay = queueDayOf(day);
  const tokens = await OpdToken.find({ doctor: doctorId, queueDay })
    .populate(POPULATE)
    .lean({ virtuals: true });

  const open = tokens.filter((t) => ['WAITING', 'CALLED', 'IN_CONSULTATION'].includes(t.status)).sort(queueOrder);
  const done = tokens.filter((t) => ['COMPLETED', 'SKIPPED'].includes(t.status))
    .sort((a, b) => b.tokenNo - a.tokenNo);

  return {
    queueDay,
    nowServing: open.find((t) => t.status === 'IN_CONSULTATION') || null,
    called: open.find((t) => t.status === 'CALLED') || null,
    waiting: open.filter((t) => t.status === 'WAITING'),
    done,
    counts: {
      waiting: open.filter((t) => t.status === 'WAITING').length,
      completed: tokens.filter((t) => t.status === 'COMPLETED').length,
      skipped: tokens.filter((t) => t.status === 'SKIPPED').length,
      total: tokens.length,
    },
  };
}

// Call the next patient.
//
// Whoever is at the front by the ordering above. The status change is the
// guard, so two receptionists pressing "next" at the same moment cannot call
// two different people to the same room.
export async function callNext(doctorId, day, userId) {
  const queueDay = queueDayOf(day);

  const waiting = await OpdToken.find({ doctor: doctorId, queueDay, status: 'WAITING' }).lean();
  if (!waiting.length) throw ApiError.badRequest('Nobody is waiting', 'QUEUE_EMPTY');

  const next = [...waiting].sort(queueOrder)[0];

  const token = await OpdToken.findOneAndUpdate(
    { _id: next._id, status: 'WAITING' },
    { status: 'CALLED', calledAt: new Date(), calledBy: userId },
    { new: true }
  );
  // Lost the race — somebody else called them. That is not an error worth
  // showing; retry once and the caller gets whoever is now at the front.
  if (!token) return callNext(doctorId, day, userId);

  return token.populate(POPULATE);
}

// Call a specific token out of order — the patient who stepped out, the one
// the doctor asked for by name.
export async function callToken(id, userId) {
  const token = await OpdToken.findOneAndUpdate(
    { _id: id, status: { $in: ['WAITING', 'SKIPPED'] } },
    { status: 'CALLED', calledAt: new Date(), calledBy: userId },
    { new: true }
  );
  if (!token) {
    const exists = await OpdToken.exists({ _id: id });
    if (!exists) throw ApiError.notFound('Token not found', 'TOKEN_NOT_FOUND');
    throw ApiError.badRequest('This token is no longer waiting', 'TOKEN_NOT_WAITING');
  }
  return token.populate(POPULATE);
}

// The patient walked in. This is what stops the waiting clock.
export async function startConsultation(id, opdVisitId = null) {
  const token = await OpdToken.findOneAndUpdate(
    { _id: id, status: { $in: ['CALLED', 'WAITING'] } },
    {
      status: 'IN_CONSULTATION',
      startedAt: new Date(),
      ...(opdVisitId ? { opdVisit: opdVisitId } : {}),
    },
    { new: true }
  );
  if (!token) {
    const exists = await OpdToken.exists({ _id: id });
    if (!exists) throw ApiError.notFound('Token not found', 'TOKEN_NOT_FOUND');
    throw ApiError.badRequest('This consultation has already started or finished', 'TOKEN_NOT_CALLABLE');
  }
  return token.populate(POPULATE);
}

export async function completeToken(id) {
  const token = await OpdToken.findOneAndUpdate(
    { _id: id, status: { $in: ['IN_CONSULTATION', 'CALLED'] } },
    { status: 'COMPLETED', completedAt: new Date() },
    { new: true }
  );
  if (!token) {
    const exists = await OpdToken.exists({ _id: id });
    if (!exists) throw ApiError.notFound('Token not found', 'TOKEN_NOT_FOUND');
    throw ApiError.badRequest('This token is not in consultation', 'TOKEN_NOT_ACTIVE');
  }
  return token.populate(POPULATE);
}

// The patient did not answer when called.
//
// Skipped, not cancelled: they have almost certainly stepped out for a moment,
// and recalling them keeps their original number rather than sending them to
// the back of a queue they already waited in.
export async function skipToken(id, reason) {
  const token = await OpdToken.findOneAndUpdate(
    { _id: id, status: { $in: ['WAITING', 'CALLED'] } },
    { status: 'SKIPPED', notes: reason || 'Did not respond when called' },
    { new: true }
  );
  if (!token) {
    const exists = await OpdToken.exists({ _id: id });
    if (!exists) throw ApiError.notFound('Token not found', 'TOKEN_NOT_FOUND');
    throw ApiError.badRequest('This token cannot be skipped', 'TOKEN_NOT_WAITING');
  }
  return token.populate(POPULATE);
}

// What goes on the screen in the waiting area.
//
// Deliberately thin: a display board is read from across a room by people who
// are anxious, so it carries the number being seen, the number after it, and
// nothing else. No names — a public screen is not the place for them.
export async function displayBoard(day) {
  const queueDay = queueDayOf(day);
  const tokens = await OpdToken.find({ queueDay, status: { $ne: 'COMPLETED' } })
    .populate({ path: 'doctor', select: 'firstName lastName specialization' })
    .lean();

  const byDoctor = new Map();
  for (const t of tokens) {
    const key = String(t.doctor?._id || t.doctor);
    if (!byDoctor.has(key)) byDoctor.set(key, { doctor: t.doctor, tokens: [] });
    byDoctor.get(key).tokens.push(t);
  }

  return [...byDoctor.values()].map(({ doctor, tokens: list }) => {
    const open = list.filter((t) => ['WAITING', 'CALLED', 'IN_CONSULTATION'].includes(t.status)).sort(queueOrder);
    const serving = open.find((t) => t.status === 'IN_CONSULTATION' || t.status === 'CALLED');
    const next = open.filter((t) => t.status === 'WAITING').slice(0, 3);

    return {
      doctor: {
        name: `Dr. ${[doctor?.firstName, doctor?.lastName].filter(Boolean).join(' ')}`.trim(),
        specialization: doctor?.specialization || '',
      },
      nowServing: serving?.tokenLabel || null,
      next: next.map((t) => t.tokenLabel),
      waiting: open.filter((t) => t.status === 'WAITING').length,
    };
  }).sort((a, b) => b.waiting - a.waiting);
}

// How the queue is actually performing.
//
// Waiting time and consultation time are reported separately because they have
// different fixes: a long wait with short consultations is a scheduling
// problem, and a long wait with long consultations is a capacity one. One
// combined average would hide which.
export async function queueStats(day) {
  const queueDay = queueDayOf(day);
  const tokens = await OpdToken.find({ queueDay }).lean({ virtuals: true });

  const seen = tokens.filter((t) => t.startedAt);
  const finished = tokens.filter((t) => t.startedAt && t.completedAt);

  const avg = (rows, pick) =>
    (rows.length ? Math.round(rows.reduce((s, r) => s + pick(r), 0) / rows.length) : null);

  return {
    queueDay,
    issued: tokens.length,
    waiting: tokens.filter((t) => t.status === 'WAITING').length,
    inConsultation: tokens.filter((t) => t.status === 'IN_CONSULTATION').length,
    completed: tokens.filter((t) => t.status === 'COMPLETED').length,
    skipped: tokens.filter((t) => t.status === 'SKIPPED').length,
    avgWaitMinutes: avg(seen, (t) => Math.round((new Date(t.startedAt) - new Date(t.issuedAt)) / 60000)),
    avgConsultationMinutes: avg(finished, (t) => Math.round((new Date(t.completedAt) - new Date(t.startedAt)) / 60000)),
    longestWaitMinutes: seen.length
      ? Math.max(...seen.map((t) => Math.round((new Date(t.startedAt) - new Date(t.issuedAt)) / 60000)))
      : null,
    walkIns: tokens.filter((t) => t.type === 'WALK_IN').length,
    booked: tokens.filter((t) => t.type === 'APPOINTMENT').length,
  };
}

export const priorityOptions = () => PRIORITY_REASONS;
