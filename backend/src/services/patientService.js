import { Patient } from '../models/Patient.js';
import { PatientDocument } from '../models/PatientDocument.js';
import { Appointment } from '../models/Appointment.js';
import { OPDVisit } from '../models/OPDVisit.js';
import { IPDAdmission } from '../models/IPDAdmission.js';
import { Invoice } from '../models/Invoice.js';
import { Payment } from '../models/Payment.js';
import { Surgery } from '../models/Surgery.js';
import { LabOrder } from '../models/LabOrder.js';
import { RadiologyOrder } from '../models/RadiologyOrder.js';
import { InsuranceClaim } from '../models/InsuranceClaim.js';
import { MedicineDispense } from '../models/MedicineDispense.js';
import { BloodUnit } from '../models/BloodUnit.js';
import { removeObject } from '../config/storage.js';
import { ApiError } from '../utils/ApiError.js';

const SORT_MAP = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  name: { firstName: 1, lastName: 1 },
};

function buildFilter({ search, status }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;

  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ uhid: rx }, { firstName: rx }, { lastName: rx }, { phone: rx }, { email: rx }];
  }
  return filter;
}

// Paginated + searchable list. Search matches UHID, name, phone, email.
export async function listPatients({ page, limit, search, status, sort }) {
  const filter = buildFilter({ search, status });

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

// Nested single-subdocument fields that must be merged key-by-key on update,
// not replaced wholesale — otherwise a partial update (e.g. just address.city)
// would wipe the rest of the nested object. Array fields (e.g. insurances) are
// replaced wholesale, since the client always sends the full list.
const NESTED_FIELDS = ['address', 'emergencyContact'];

export async function createPatient(data, userId) {
  const { confirmDuplicate, ...rest } = data;

  // Warn (once) on a likely duplicate registration before creating a second
  // UHID for the same person. The caller re-submits with confirmDuplicate:
  // true to proceed anyway (e.g. genuine family members sharing a phone).
  if (!confirmDuplicate && rest.phone) {
    const existing = await Patient.findOne({ phone: rest.phone }).select('firstName lastName uhid phone status');
    if (existing) {
      throw ApiError.conflict(
        `A patient with this phone number already exists: ${existing.fullName} (${existing.uhid}).`,
        'DUPLICATE_PATIENT',
        {
          existing: {
            id: existing._id,
            uhid: existing.uhid,
            fullName: existing.fullName,
            phone: existing.phone,
            status: existing.status,
          },
        }
      );
    }
  }

  const patient = new Patient({ ...rest, createdBy: userId });
  await patient.save(); // pre-save hook assigns UHID
  return patient;
}

export async function updatePatient(id, data) {
  const patient = await Patient.findById(id);
  if (!patient) throw ApiError.notFound('Patient not found', 'PATIENT_NOT_FOUND');

  // UHID and createdBy are immutable from the update path.
  for (const [key, value] of Object.entries(data)) {
    if (NESTED_FIELDS.includes(key) && value && typeof value === 'object') {
      Object.assign(patient[key], value);
    } else {
      patient[key] = value;
    }
  }
  await patient.save();
  return patient;
}

export async function deletePatient(id) {
  const patient = await Patient.findById(id);
  if (!patient) throw ApiError.notFound('Patient not found', 'PATIENT_NOT_FOUND');

  // Refuse to hard-delete a patient with clinical or financial history —
  // that would silently orphan Appointments/OPD/IPD/Invoice records.
  const [appointments, opdVisits, ipdAdmissions, invoices] = await Promise.all([
    Appointment.countDocuments({ patient: id }),
    OPDVisit.countDocuments({ patient: id }),
    IPDAdmission.countDocuments({ patient: id }),
    Invoice.countDocuments({ patient: id }),
  ]);

  if (appointments || opdVisits || ipdAdmissions || invoices) {
    throw ApiError.conflict(
      'This patient has appointments, visits, admissions or invoices on record and cannot be deleted. Set their status to Inactive instead.',
      'PATIENT_HAS_HISTORY',
      { appointments, opdVisits, ipdAdmissions, invoices }
    );
  }

  // No history — safe to remove: cascade the attached documents (files + records) first.
  const docs = await PatientDocument.find({ patient: id }).select('storageKey');
  await Promise.all(docs.map((d) => removeObject(d.storageKey)));
  await PatientDocument.deleteMany({ patient: id });

  await Patient.findByIdAndDelete(id);
  return patient;
}

// Records that carry a `patient` (or `issuedTo`) reference — reassigned when
// two duplicate patient profiles are merged into one.
const MERGE_TARGETS = [
  { model: PatientDocument, field: 'patient', label: 'documents' },
  { model: Appointment, field: 'patient', label: 'appointments' },
  { model: OPDVisit, field: 'patient', label: 'opdVisits' },
  { model: IPDAdmission, field: 'patient', label: 'ipdAdmissions' },
  { model: Surgery, field: 'patient', label: 'surgeries' },
  { model: LabOrder, field: 'patient', label: 'labOrders' },
  { model: RadiologyOrder, field: 'patient', label: 'radiologyOrders' },
  { model: Invoice, field: 'patient', label: 'invoices' },
  { model: Payment, field: 'patient', label: 'payments' },
  { model: InsuranceClaim, field: 'patient', label: 'insuranceClaims' },
  { model: MedicineDispense, field: 'patient', label: 'medicineDispenses' },
  { model: BloodUnit, field: 'issuedTo', label: 'bloodUnitsIssued' },
];

// Merge `duplicateId` into `survivorId`: every clinical/financial record
// pointing at the duplicate is repointed at the survivor, then the duplicate
// patient profile is removed. The survivor's own fields are untouched — the
// caller picks which of the two profiles to keep before calling this.
// Note: this runs as a sequence of updateMany calls, not a single DB
// transaction — safe to re-run if it's ever interrupted partway (each step
// is idempotent), but a mid-merge crash could leave some records moved and
// others not yet moved.
export async function mergePatients(survivorId, duplicateId) {
  if (String(survivorId) === String(duplicateId)) {
    throw ApiError.badRequest('Cannot merge a patient into itself', 'MERGE_SAME_PATIENT');
  }
  const [survivor, duplicate] = await Promise.all([
    Patient.findById(survivorId),
    Patient.findById(duplicateId),
  ]);
  if (!survivor) throw ApiError.notFound('Survivor patient not found', 'PATIENT_NOT_FOUND');
  if (!duplicate) throw ApiError.notFound('Duplicate patient not found', 'PATIENT_NOT_FOUND');

  const moved = {};
  for (const { model, field, label } of MERGE_TARGETS) {
    const res = await model.updateMany({ [field]: duplicateId }, { $set: { [field]: survivorId } });
    moved[label] = res.modifiedCount || 0;
  }

  await Patient.findByIdAndDelete(duplicateId);
  return { survivor, moved };
}

// Flat rows for CSV/XLSX export — same filter as the list view, no pagination cap.
export async function patientRowsForExport({ search, status }) {
  const filter = buildFilter({ search, status });
  const patients = await Patient.find(filter).sort(SORT_MAP.newest);

  return patients.map((p) => ({
    UHID: p.uhid,
    'First Name': p.firstName,
    'Last Name': p.lastName,
    Gender: p.gender,
    'Date of Birth': p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : '',
    Age: p.age,
    Phone: p.phone,
    Email: p.email,
    'Blood Group': p.bloodGroup,
    Status: p.status,
    City: p.address?.city || '',
    State: p.address?.state || '',
    'Registered On': p.createdAt ? p.createdAt.toISOString().slice(0, 10) : '',
  }));
}

// Lightweight counts for dashboards / headers.
export async function patientStats() {
  const [total, active] = await Promise.all([
    Patient.countDocuments({}),
    Patient.countDocuments({ status: 'ACTIVE' }),
  ]);
  return { total, active, inactive: total - active };
}
