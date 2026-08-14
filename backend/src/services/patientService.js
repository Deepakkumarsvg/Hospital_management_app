import { Patient } from '../models/Patient.js';
import { ApiError } from '../utils/ApiError.js';

const SORT_MAP = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  name: { firstName: 1, lastName: 1 },
};

// Paginated + searchable list. Search matches UHID, name, phone, email.
export async function listPatients({ page, limit, search, status, sort }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;

  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ uhid: rx }, { firstName: rx }, { lastName: rx }, { phone: rx }, { email: rx }];
  }

  const [items, total] = await Promise.all([
    Patient.find(filter)
      .sort(SORT_MAP[sort] || SORT_MAP.newest)
      .skip((page - 1) * limit)
      .limit(limit),
    Patient.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
}

export async function getPatientById(id) {
  const patient = await Patient.findById(id).populate('createdBy', 'name role');
  if (!patient) throw ApiError.notFound('Patient not found', 'PATIENT_NOT_FOUND');
  return patient;
}

export async function createPatient(data, userId) {
  const patient = new Patient({ ...data, createdBy: userId });
  await patient.save(); // pre-save hook assigns UHID
  return patient;
}

export async function updatePatient(id, data) {
  const patient = await Patient.findById(id);
  if (!patient) throw ApiError.notFound('Patient not found', 'PATIENT_NOT_FOUND');

  // UHID and createdBy are immutable from the update path.
  Object.assign(patient, data);
  await patient.save();
  return patient;
}

export async function deletePatient(id) {
  const patient = await Patient.findByIdAndDelete(id);
  if (!patient) throw ApiError.notFound('Patient not found', 'PATIENT_NOT_FOUND');
  return patient;
}

// Lightweight counts for dashboards / headers.
export async function patientStats() {
  const [total, active] = await Promise.all([
    Patient.countDocuments({}),
    Patient.countDocuments({ status: 'ACTIVE' }),
  ]);
  return { total, active, inactive: total - active };
}
