import { Doctor } from '../models/Doctor.js';
import { Appointment } from '../models/Appointment.js';
import { OPDVisit } from '../models/OPDVisit.js';
import { IPDAdmission } from '../models/IPDAdmission.js';
import { Surgery } from '../models/Surgery.js';
import { LabOrder } from '../models/LabOrder.js';
import { RadiologyOrder } from '../models/RadiologyOrder.js';
import { ApiError } from '../utils/ApiError.js';

export async function listDoctors({ page, limit, search, department, status }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (department) filter.department = department;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ firstName: rx }, { lastName: rx }, { specialization: rx }, { registrationNo: rx }, { phone: rx }];
  }
  const [items, total] = await Promise.all([
    Doctor.find(filter).populate('department', 'name code').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Doctor.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function activeDoctors(department) {
  const filter = { status: 'ACTIVE' };
  if (department) filter.department = department;
  return Doctor.find(filter).populate('department', 'name code').sort({ firstName: 1 });
}

export async function getDoctor(id) {
  const doc = await Doctor.findById(id).populate('department', 'name code').populate('user', 'name email status');
  if (!doc) throw ApiError.notFound('Doctor not found', 'DOCTOR_NOT_FOUND');
  return doc;
}

// Resolve the Doctor profile linked to a login user (for the doctor dashboard).
export async function getDoctorByUser(userId) {
  return Doctor.findOne({ user: userId }).populate('department', 'name code');
}

export async function createDoctor(data) {
  const doc = await Doctor.create(data);
  return doc.populate('department', 'name code');
}

export async function updateDoctor(id, data) {
  const doc = await Doctor.findByIdAndUpdate(id, data, { new: true, runValidators: true }).populate('department', 'name code');
  if (!doc) throw ApiError.notFound('Doctor not found', 'DOCTOR_NOT_FOUND');
  return doc;
}

export async function deleteDoctor(id) {
  const doc = await Doctor.findById(id);
  if (!doc) throw ApiError.notFound('Doctor not found', 'DOCTOR_NOT_FOUND');

  // Refuse to hard-delete a doctor with clinical history — that would orphan
  // required references on Appointments/OPD/IPD/Surgery (and optional ones
  // on Lab/Radiology orders), erasing who actually treated the patient.
  const [appointments, opdVisits, ipdAdmissions, surgeries, labOrders, radOrders] = await Promise.all([
    Appointment.countDocuments({ doctor: id }),
    OPDVisit.countDocuments({ doctor: id }),
    IPDAdmission.countDocuments({ admittingDoctor: id }),
    Surgery.countDocuments({ surgeon: id }),
    LabOrder.countDocuments({ doctor: id }),
    RadiologyOrder.countDocuments({ doctor: id }),
  ]);

  if (appointments || opdVisits || ipdAdmissions || surgeries || labOrders || radOrders) {
    throw ApiError.conflict(
      'This doctor has appointments, visits, admissions, surgeries or orders on record and cannot be deleted. Set their status to Inactive instead.',
      'DOCTOR_HAS_HISTORY',
      { appointments, opdVisits, ipdAdmissions, surgeries, labOrders, radOrders }
    );
  }

  await Doctor.findByIdAndDelete(id);
  return doc;
}

export async function doctorStats() {
  const [total, active] = await Promise.all([
    Doctor.countDocuments({}),
    Doctor.countDocuments({ status: 'ACTIVE' }),
  ]);
  return { total, active, inactive: total - active };
}

// Flat rows for CSV/XLSX export.
export async function doctorRowsForExport({ search, department, status }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (department) filter.department = department;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ firstName: rx }, { lastName: rx }, { specialization: rx }, { registrationNo: rx }, { phone: rx }];
  }
  const doctors = await Doctor.find(filter).populate('department', 'name code').sort({ firstName: 1 });

  return doctors.map((d) => ({
    Name: d.fullName,
    'Registration No': d.registrationNo,
    Specialization: d.specialization,
    Department: d.department?.name || '',
    Qualification: d.qualification,
    'Experience (yrs)': d.experienceYears,
    Phone: d.phone,
    Email: d.email,
    'Consultation Fee': d.consultationFee,
    Status: d.status,
  }));
}
