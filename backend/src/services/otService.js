import { OperationTheatre } from '../models/OperationTheatre.js';
import { Surgery, SURGERY_TRANSITIONS } from '../models/Surgery.js';
import { Patient } from '../models/Patient.js';
import { Doctor } from '../models/Doctor.js';
import { ApiError } from '../utils/ApiError.js';

// Theatres
export const listTheatres = () => OperationTheatre.find().sort({ name: 1 });
export const activeTheatres = () => OperationTheatre.find({ status: 'ACTIVE' }).sort({ name: 1 });
export const createTheatre = (data) => OperationTheatre.create(data);
export async function updateTheatre(id, data) {
  const t = await OperationTheatre.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!t) throw ApiError.notFound('Theatre not found', 'OT_NOT_FOUND');
  return t;
}
export async function deleteTheatre(id) {
  const t = await OperationTheatre.findByIdAndDelete(id);
  if (!t) throw ApiError.notFound('Theatre not found', 'OT_NOT_FOUND');
  return t;
}

// Surgeries
const POPULATE = [
  { path: 'patient', select: 'uhid firstName lastName' },
  { path: 'theatre', select: 'name code specialization' },
  { path: 'surgeon', select: 'firstName lastName specialization' },
  { path: 'admission', select: 'admissionNo' },
];

export async function listSurgeries({ page, limit, status, theatre, surgeon, from, to, search }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (theatre) filter.theatre = theatre;
  if (surgeon) filter.surgeon = surgeon;
  if (from || to) {
    filter.scheduledDate = {};
    if (from) filter.scheduledDate.$gte = from;
    if (to) filter.scheduledDate.$lte = to;
  }
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ surgeryNo: rx }, { procedure: rx }];
  }
  const [items, total] = await Promise.all([
    Surgery.find(filter).populate(POPULATE).sort({ scheduledDate: -1 }).skip((page - 1) * limit).limit(limit),
    Surgery.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}
export async function getSurgery(id) {
  const s = await Surgery.findById(id).populate(POPULATE);
  if (!s) throw ApiError.notFound('Surgery not found', 'SURGERY_NOT_FOUND');
  return s;
}

// A theatre can only host one active (SCHEDULED/IN_PROGRESS) surgery at a
// time — reject a booking whose [start, start+duration) window overlaps an
// existing one in the same theatre.
async function assertNoConflict({ theatre, scheduledDate, scheduledTime, estimatedDuration }, excludeId) {
  if (!theatre || !scheduledDate) return;
  const [h, m] = (scheduledTime || '00:00').split(':').map(Number);
  const start = new Date(scheduledDate);
  start.setHours(h || 0, m || 0, 0, 0);
  const end = new Date(start.getTime() + (estimatedDuration || 120) * 60000);
  const dayStart = new Date(start); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(start); dayEnd.setHours(23, 59, 59, 999);

  const filter = {
    theatre,
    status: { $in: ['SCHEDULED', 'IN_PROGRESS'] },
    scheduledDate: { $gte: dayStart, $lte: dayEnd },
  };
  if (excludeId) filter._id = { $ne: excludeId };

  const sameDay = await Surgery.find(filter).select('scheduledTime estimatedDuration surgeryNo');
  for (const other of sameDay) {
    const [oh, om] = (other.scheduledTime || '00:00').split(':').map(Number);
    const oStart = new Date(start); oStart.setHours(oh || 0, om || 0, 0, 0);
    const oEnd = new Date(oStart.getTime() + (other.estimatedDuration || 120) * 60000);
    if (start < oEnd && oStart < end) {
      throw ApiError.badRequest(`Theatre is already booked for ${other.surgeryNo} at that time`, 'THEATRE_CONFLICT');
    }
  }
}

export async function createSurgery(data, userId) {
  const [patient, surgeon] = await Promise.all([
    Patient.findById(data.patient).select('_id'),
    Doctor.findById(data.surgeon).select('_id'),
  ]);
  if (!patient) throw ApiError.badRequest('Patient does not exist', 'PATIENT_NOT_FOUND');
  if (!surgeon) throw ApiError.badRequest('Surgeon does not exist', 'DOCTOR_NOT_FOUND');
  await assertNoConflict(data);
  const s = new Surgery({ ...data, createdBy: userId });
  await s.save();
  return s.populate(POPULATE);
}
export async function updateSurgery(id, data) {
  const s = await Surgery.findById(id);
  if (!s) throw ApiError.notFound('Surgery not found', 'SURGERY_NOT_FOUND');
  if (['COMPLETED', 'CANCELLED'].includes(s.status)) throw ApiError.badRequest('Surgery is closed', 'SURGERY_LOCKED');
  if (data.theatre || data.scheduledDate || data.scheduledTime || data.estimatedDuration) {
    await assertNoConflict({
      theatre: data.theatre || s.theatre,
      scheduledDate: data.scheduledDate || s.scheduledDate,
      scheduledTime: data.scheduledTime ?? s.scheduledTime,
      estimatedDuration: data.estimatedDuration ?? s.estimatedDuration,
    }, id);
  }
  Object.assign(s, data);
  await s.save();
  return s.populate(POPULATE);
}
export async function changeStatus(id, next) {
  const s = await Surgery.findById(id);
  if (!s) throw ApiError.notFound('Surgery not found', 'SURGERY_NOT_FOUND');
  const allowed = SURGERY_TRANSITIONS[s.status] || [];
  if (!allowed.includes(next)) throw ApiError.badRequest(`Cannot change status from ${s.status} to ${next}`, 'INVALID_STATUS_TRANSITION');
  s.status = next;
  await s.save();
  return s.populate(POPULATE);
}
export async function otStats() {
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const [theatres, scheduled, today, completedThisMonth] = await Promise.all([
    OperationTheatre.countDocuments({ status: 'ACTIVE' }),
    Surgery.countDocuments({ status: { $in: ['SCHEDULED', 'IN_PROGRESS'] } }),
    Surgery.countDocuments({ scheduledDate: { $gte: dayStart, $lte: dayEnd }, status: { $ne: 'CANCELLED' } }),
    Surgery.countDocuments({ status: 'COMPLETED', updatedAt: { $gte: monthStart } }),
  ]);
  return { theatres, scheduled, today, completedThisMonth };
}
