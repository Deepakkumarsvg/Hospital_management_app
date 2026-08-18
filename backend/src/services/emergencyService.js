import { EmergencyVisit, triageLevel } from '../models/EmergencyVisit.js';
import { Patient } from '../models/Patient.js';
import { Doctor } from '../models/Doctor.js';
import { Counter } from '../models/Counter.js';
import { ApiError } from '../utils/ApiError.js';
import { admitPatient } from './ipdService.js';
import { notify } from './notificationService.js';
import { buildSearchFilter } from './searchFilters.js';

const POPULATE = [
  { path: 'patient', select: 'uhid firstName lastName phone gender dateOfBirth bloodGroup allergies' },
  { path: 'attendingDoctor', select: 'firstName lastName specialization' },
  { path: 'triagedBy', select: 'name' },
  { path: 'dispositionBy', select: 'name' },
  { path: 'admission', select: 'admissionNo' },
];

// ---------------------------------------------------------------------------
// Arrival
// ---------------------------------------------------------------------------

// Open a chart for somebody who has just come through the door.
//
// Either a known patient or an unidentified one — never both, and never
// neither. Casualty's whole job is to start treating before the paperwork
// exists, so refusing to open a record without an identity would make the
// module useless for the cases it is for.
export async function registerArrival(data, userId) {
  if (data.patient && data.unidentified) {
    throw ApiError.badRequest(
      'A visit is either for a known patient or an unidentified one, not both',
      'ER_IDENTITY_AMBIGUOUS'
    );
  }
  if (!data.patient && !data.unidentified) {
    throw ApiError.badRequest(
      'Give a patient, or mark the arrival as unidentified',
      'ER_IDENTITY_REQUIRED'
    );
  }

  if (data.patient) {
    const exists = await Patient.exists({ _id: data.patient });
    if (!exists) throw ApiError.badRequest('Patient does not exist', 'PATIENT_NOT_FOUND');
  }

  const visit = new EmergencyVisit({
    ...data,
    // An unidentified arrival needs something to be called on the board and on
    // a wristband immediately. A sequential alias is unambiguous in a way that
    // "unknown male" alone is not once there are two of them.
    unidentified: data.unidentified
      ? { ...data.unidentified, alias: data.unidentified.alias || await nextAlias() }
      : null,
    createdBy: userId,
  });
  await visit.save();

  // Level 1 and 2 patients need a clinician now, not when somebody next looks
  // at the board.
  if (visit.triageLevel && visit.triageLevel <= 2) alertResuscitation(visit);

  return visit.populate(POPULATE);
}

async function nextAlias() {
  const year = new Date().getFullYear();
  const seq = await Counter.next(`er-alias-${year}`);
  return `Unknown ${seq}`;
}

function alertResuscitation(visit) {
  const t = triageLevel(visit.triageLevel);
  notify({
    role: 'DOCTOR',
    type: 'EMERGENCY',
    title: `${t?.label || 'Critical'} case in casualty`,
    message: `${visit.erNo} · ${visit.chiefComplaint} · seen within ${t?.targetMinutes ?? 0} min`,
    link: '/emergency',
  });
}

// ---------------------------------------------------------------------------
// Triage
// ---------------------------------------------------------------------------

// Assign or revise an acuity level.
//
// Re-triage is a normal event — a patient deteriorates in the waiting room —
// so this appends to the history rather than overwriting it. Being able to
// show that somebody was moved from level 4 to level 1 at 02:14, and by whom,
// is the point of recording triage at all.
export async function triage(id, { level, vitals, notes, reason }, userId) {
  const visit = await EmergencyVisit.findById(id);
  if (!visit) throw ApiError.notFound('Emergency visit not found', 'ER_NOT_FOUND');
  if (visit.status === 'CLOSED') {
    throw ApiError.badRequest('This visit is already closed', 'ER_CLOSED');
  }

  const previous = visit.triageLevel;
  const escalated = previous !== null && level < previous;

  visit.triageLevel = level;
  if (vitals) visit.triageVitals = { ...visit.triageVitals?.toObject?.() ?? {}, ...vitals };
  if (notes !== undefined) visit.triageNotes = notes;
  // The first assessment stamps the clock; a re-triage does not restart it,
  // because door-to-doctor is measured from the door.
  if (!visit.triagedAt) {
    visit.triagedAt = new Date();
    visit.triagedBy = userId;
  }
  visit.triageHistory.push({ level, by: userId, reason: reason || (previous === null ? 'Initial triage' : 'Re-triage') });

  await visit.save();

  if (level <= 2 && (previous === null || escalated)) alertResuscitation(visit);

  return visit.populate(POPULATE);
}

// ---------------------------------------------------------------------------
// Treatment
// ---------------------------------------------------------------------------

// Record that a clinician has picked the patient up.
//
// firstSeenAt is set once and never moved: it is the measurement, and a
// measurement that gets rewritten when a second doctor takes over is not one.
export async function startTreatment(id, doctorId) {
  const doctor = await Doctor.findById(doctorId).select('_id status');
  if (!doctor) throw ApiError.badRequest('Doctor does not exist', 'DOCTOR_NOT_FOUND');

  const visit = await EmergencyVisit.findOneAndUpdate(
    { _id: id, status: { $ne: 'CLOSED' } },
    [
      {
        $set: {
          attendingDoctor: doctor._id,
          status: 'IN_TREATMENT',
          firstSeenAt: { $ifNull: ['$firstSeenAt', '$$NOW'] },
        },
      },
    ],
    { new: true }
  );
  if (!visit) {
    const exists = await EmergencyVisit.exists({ _id: id });
    if (!exists) throw ApiError.notFound('Emergency visit not found', 'ER_NOT_FOUND');
    throw ApiError.badRequest('This visit is already closed', 'ER_CLOSED');
  }
  return visit.populate(POPULATE);
}

export async function updateVisit(id, data) {
  const visit = await EmergencyVisit.findById(id);
  if (!visit) throw ApiError.notFound('Emergency visit not found', 'ER_NOT_FOUND');
  if (visit.status === 'CLOSED') {
    throw ApiError.badRequest('A closed visit cannot be edited', 'ER_CLOSED');
  }
  Object.assign(visit, data);
  await visit.save();
  return visit.populate(POPULATE);
}

// Move to observation — treated, not ready to leave, not admitted either.
export async function observe(id) {
  const visit = await EmergencyVisit.findOneAndUpdate(
    { _id: id, status: { $in: ['WAITING', 'IN_TREATMENT'] } },
    { status: 'OBSERVATION' },
    { new: true }
  );
  if (!visit) {
    const exists = await EmergencyVisit.exists({ _id: id });
    if (!exists) throw ApiError.notFound('Emergency visit not found', 'ER_NOT_FOUND');
    throw ApiError.badRequest('Only an open visit can be moved to observation', 'ER_CLOSED');
  }
  return visit.populate(POPULATE);
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

// Put a name to an unidentified patient.
//
// Everything clinical stays exactly where it is — this only fills in who the
// chart belongs to. The alias is kept rather than deleted, because notes and
// wristbands written during the resuscitation refer to it.
export async function identifyPatient(id, patientId) {
  const [visit, patient] = await Promise.all([
    EmergencyVisit.findById(id),
    Patient.findById(patientId).select('_id'),
  ]);
  if (!visit) throw ApiError.notFound('Emergency visit not found', 'ER_NOT_FOUND');
  if (!patient) throw ApiError.badRequest('Patient does not exist', 'PATIENT_NOT_FOUND');
  if (visit.patient) {
    throw ApiError.badRequest('This visit already belongs to a patient', 'ER_ALREADY_IDENTIFIED');
  }

  visit.patient = patient._id;
  await visit.save();
  return visit.populate(POPULATE);
}

// ---------------------------------------------------------------------------
// Medico-legal
// ---------------------------------------------------------------------------

// Flag a visit as a medico-legal case and record the police intimation.
//
// Reporting an assault, a poisoning or a road accident is a statutory duty in
// India, not a workflow preference — so the record carries who informed which
// station and when, which is the thing that gets asked for in court.
export async function flagMLC(id, data, userId) {
  const visit = await EmergencyVisit.findById(id);
  if (!visit) throw ApiError.notFound('Emergency visit not found', 'ER_NOT_FOUND');

  const mlcNo = visit.mlc?.mlcNo || await nextMlcNo();
  visit.isMLC = true;
  visit.mlc = {
    ...(visit.mlc?.toObject?.() ?? {}),
    ...data,
    mlcNo,
    // Stamp the intimation only when a station has actually been named —
    // otherwise the record would claim the police were told when they were not.
    informedAt: data.policeStation ? (data.informedAt || new Date()) : (visit.mlc?.informedAt || null),
    informedBy: data.policeStation ? userId : (visit.mlc?.informedBy || null),
  };
  await visit.save();
  return visit.populate(POPULATE);
}

async function nextMlcNo() {
  const year = new Date().getFullYear();
  const seq = await Counter.next(`mlc-${year}`);
  return `MLC-${year}-${String(seq).padStart(5, '0')}`;
}

// ---------------------------------------------------------------------------
// Disposition
// ---------------------------------------------------------------------------

// Close the visit with an outcome.
//
// The status change is the guard: only a still-open visit matches, so two
// clinicians closing at once cannot both run the admission step below.
export async function dispose(id, data, userId) {
  const visit = await EmergencyVisit.findOneAndUpdate(
    { _id: id, status: { $ne: 'CLOSED' } },
    {
      status: 'CLOSED',
      disposition: data.disposition,
      dispositionAt: new Date(),
      dispositionBy: userId,
      dispositionNotes: data.notes || '',
      referredTo: data.referredTo || '',
    },
    { new: true }
  );
  if (!visit) {
    const exists = await EmergencyVisit.exists({ _id: id });
    if (!exists) throw ApiError.notFound('Emergency visit not found', 'ER_NOT_FOUND');
    throw ApiError.badRequest('This visit is already closed', 'ER_CLOSED');
  }

  if (data.disposition !== 'ADMITTED') return visit.populate(POPULATE);

  // Admitting from casualty creates the ward record and links the two, so the
  // ward can see what happened downstairs.
  if (!visit.patient) {
    await reopen(visit._id);
    throw ApiError.badRequest(
      'An unidentified patient cannot be admitted — identify them first',
      'ER_ADMIT_NEEDS_IDENTITY'
    );
  }

  try {
    const admission = await admitPatient({
      patient: visit.patient,
      admittingDoctor: data.admittingDoctor || visit.attendingDoctor,
      department: data.department,
      bed: data.bed,
      reason: visit.chiefComplaint,
      diagnosis: visit.provisionalDiagnosis || '',
    }, userId);

    visit.admission = admission._id;
    await visit.save();
    return visit.populate(POPULATE);
  } catch (err) {
    // No bed, no doctor, no ward — the admission did not happen, so the visit
    // must not be left closed as ADMITTED. Put it back and surface the real
    // reason, which is almost always "there is no free bed".
    await reopen(visit._id);
    throw err;
  }
}

function reopen(id) {
  return EmergencyVisit.updateOne(
    { _id: id },
    {
      $set: { status: 'IN_TREATMENT' },
      $unset: { disposition: '', dispositionAt: '', dispositionBy: '' },
    }
  ).catch(() => {});
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

// The live queue: who to see next, in order.
//
// Sorting is the clinical rule, not a display choice — most urgent first, and
// within a level the longest wait first. Patients who have not been triaged
// yet come before everyone, because an unassessed patient is an unknown risk.
export async function queue() {
  const open = await EmergencyVisit.find({ status: { $ne: 'CLOSED' } })
    .populate(POPULATE)
    .lean({ virtuals: true });

  return open.sort((a, b) => {
    const la = a.triageLevel ?? 0;
    const lb = b.triageLevel ?? 0;
    if (la !== lb) return la - lb;
    return new Date(a.arrivalTime) - new Date(b.arrivalTime);
  });
}

export async function listVisits({ page = 1, limit = 20, search, status, triageLevel: level, mlc, from, to } = {}) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (level) filter.triageLevel = Number(level);
  if (mlc === 'true') filter.isMLC = true;
  if (from || to) {
    filter.arrivalTime = {};
    if (from) { const d = new Date(from); d.setHours(0, 0, 0, 0); filter.arrivalTime.$gte = d; }
    if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); filter.arrivalTime.$lte = d; }
  }
  Object.assign(filter, await buildSearchFilter(search, ['erNo', 'chiefComplaint'], { patient: true }));

  const [items, total] = await Promise.all([
    EmergencyVisit.find(filter).populate(POPULATE).sort({ arrivalTime: -1 }).skip((page - 1) * limit).limit(limit),
    EmergencyVisit.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function getVisit(id) {
  const visit = await EmergencyVisit.findById(id).populate([
    ...POPULATE,
    { path: 'triageHistory.by', select: 'name' },
    { path: 'mlc.informedBy', select: 'name' },
  ]);
  if (!visit) throw ApiError.notFound('Emergency visit not found', 'ER_NOT_FOUND');
  return visit;
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

// What the department is actually being judged on.
//
// The headline number is triage-target compliance: of the patients seen, how
// many were seen inside the time their acuity called for. A department can
// have a short average wait and still be failing its sickest patients, which
// is why this is reported per level rather than as one mean.
export async function erStats({ from, to } = {}) {
  const range = {};
  if (from) { const d = new Date(from); d.setHours(0, 0, 0, 0); range.$gte = d; }
  if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); range.$lte = d; }
  const match = Object.keys(range).length ? { arrivalTime: range } : {};

  const [waiting, inTreatment, observation, byDisposition, seen, mlcCount] = await Promise.all([
    EmergencyVisit.countDocuments({ status: 'WAITING' }),
    EmergencyVisit.countDocuments({ status: 'IN_TREATMENT' }),
    EmergencyVisit.countDocuments({ status: 'OBSERVATION' }),
    EmergencyVisit.aggregate([
      { $match: { ...match, disposition: { $ne: null } } },
      { $group: { _id: '$disposition', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    // Door-to-doctor, per acuity level, for everyone a clinician has reached.
    EmergencyVisit.aggregate([
      { $match: { ...match, firstSeenAt: { $ne: null }, triageLevel: { $ne: null } } },
      {
        $project: {
          triageLevel: 1,
          minutes: { $divide: [{ $subtract: ['$firstSeenAt', '$arrivalTime'] }, 60000] },
        },
      },
      {
        $group: {
          _id: '$triageLevel',
          count: { $sum: 1 },
          avgMinutes: { $avg: '$minutes' },
          maxMinutes: { $max: '$minutes' },
          minutes: { $push: '$minutes' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    EmergencyVisit.countDocuments({ ...match, isMLC: true }),
  ]);

  const doorToDoctor = seen.map((row) => {
    const target = triageLevel(row._id)?.targetMinutes ?? 0;
    const withinTarget = row.minutes.filter((m) => m <= target).length;
    return {
      level: row._id,
      label: triageLevel(row._id)?.label || `Level ${row._id}`,
      targetMinutes: target,
      seen: row.count,
      avgMinutes: Math.round(row.avgMinutes),
      maxMinutes: Math.round(row.maxMinutes),
      withinTarget,
      compliancePercent: row.count ? Math.round((withinTarget / row.count) * 100) : 0,
    };
  });

  const totalSeen = doorToDoctor.reduce((s, r) => s + r.seen, 0);
  const totalWithin = doorToDoctor.reduce((s, r) => s + r.withinTarget, 0);

  return {
    live: { waiting, inTreatment, observation, total: waiting + inTreatment + observation },
    doorToDoctor,
    overallCompliancePercent: totalSeen ? Math.round((totalWithin / totalSeen) * 100) : null,
    dispositions: byDisposition.map((d) => ({ disposition: d._id, count: d.count })),
    mlcCases: mlcCount,
  };
}

// Flat rows for the statutory MLC register.
export async function mlcRegisterRows({ from, to } = {}) {
  const { items } = await listVisits({ page: 1, limit: 100000, mlc: 'true', from, to });
  return items.map((v) => ({
    'MLC No': v.mlc?.mlcNo || '',
    'ER No': v.erNo,
    Date: v.arrivalTime?.toISOString().slice(0, 10) || '',
    Patient: v.displayName,
    UHID: v.patient?.uhid || '',
    Nature: v.mlc?.nature || '',
    'Brought By': v.unidentified?.broughtBy || v.arrivalMode,
    'Police Station': v.mlc?.policeStation || '',
    'Informed At': v.mlc?.informedAt ? new Date(v.mlc.informedAt).toISOString().slice(0, 16).replace('T', ' ') : '',
    Complaint: v.chiefComplaint,
    Outcome: v.disposition || v.status,
  }));
}
