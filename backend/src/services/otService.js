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
  { path: 'theatre', select: 'name code' },
  { path: 'surgeon', select: 'firstName lastName specialization' },
];

export async function listSurgeries({ page, limit, status }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
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
export async function createSurgery(data, userId) {
  const [patient, surgeon] = await Promise.all([
    Patient.findById(data.patient).select('_id'),
    Doctor.findById(data.surgeon).select('_id'),
  ]);
  if (!patient) throw ApiError.badRequest('Patient does not exist', 'PATIENT_NOT_FOUND');
  if (!surgeon) throw ApiError.badRequest('Surgeon does not exist', 'DOCTOR_NOT_FOUND');
  const s = new Surgery({ ...data, createdBy: userId });
  await s.save();
  return s.populate(POPULATE);
}
export async function updateSurgery(id, data) {
  const s = await Surgery.findById(id);
  if (!s) throw ApiError.notFound('Surgery not found', 'SURGERY_NOT_FOUND');
  if (['COMPLETED', 'CANCELLED'].includes(s.status)) throw ApiError.badRequest('Surgery is closed', 'SURGERY_LOCKED');
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
  const [theatres, scheduled] = await Promise.all([
    OperationTheatre.countDocuments({ status: 'ACTIVE' }),
    Surgery.countDocuments({ status: { $in: ['SCHEDULED', 'IN_PROGRESS'] } }),
  ]);
  return { theatres, scheduled };
}
