import { Department } from '../models/Department.js';
import { Doctor } from '../models/Doctor.js';
import { Appointment } from '../models/Appointment.js';
import { OPDVisit } from '../models/OPDVisit.js';
import { IPDAdmission } from '../models/IPDAdmission.js';
import { ApiError } from '../utils/ApiError.js';

function buildFilter({ search, status }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { code: rx }];
  }
  return filter;
}

export async function listDepartments({ page, limit, search, status }) {
  const filter = buildFilter({ search, status });
  const [items, total] = await Promise.all([
    Department.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit),
    Department.countDocuments(filter),
  ]);

  // Doctor count per department — lets admins see at a glance why a delete
  // might be blocked, instead of finding out only after clicking Delete.
  const counts = await Doctor.aggregate([
    { $match: { department: { $in: items.map((d) => d._id) } } },
    { $group: { _id: '$department', count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
  const withCounts = items.map((d) => ({ ...d.toObject(), doctorCount: countMap[String(d._id)] || 0 }));

  return { items: withCounts, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

// Simple unpaginated list for dropdowns.
export async function activeDepartments() {
  return Department.find({ status: 'ACTIVE' }).sort({ name: 1 }).select('name code');
}

export async function getDepartment(id) {
  const dep = await Department.findById(id);
  if (!dep) throw ApiError.notFound('Department not found', 'DEPARTMENT_NOT_FOUND');
  return dep;
}

export async function createDepartment(data) {
  return Department.create(data);
}

export async function updateDepartment(id, data) {
  const dep = await Department.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!dep) throw ApiError.notFound('Department not found', 'DEPARTMENT_NOT_FOUND');
  return dep;
}

export async function deleteDepartment(id) {
  const dep = await Department.findById(id);
  if (!dep) throw ApiError.notFound('Department not found', 'DEPARTMENT_NOT_FOUND');

  const [doctors, appointments, opdVisits, ipdAdmissions] = await Promise.all([
    Doctor.countDocuments({ department: id }),
    Appointment.countDocuments({ department: id }),
    OPDVisit.countDocuments({ department: id }),
    IPDAdmission.countDocuments({ department: id }),
  ]);
  if (doctors || appointments || opdVisits || ipdAdmissions) {
    throw ApiError.conflict(
      'This department has doctors, appointments or visits linked and cannot be deleted. Set its status to Inactive instead.',
      'DEPARTMENT_HAS_HISTORY',
      { doctors, appointments, opdVisits, ipdAdmissions }
    );
  }

  await Department.findByIdAndDelete(id);
  return dep;
}

// Flat rows for CSV/XLSX export.
export async function departmentRowsForExport({ search, status }) {
  const filter = buildFilter({ search, status });
  const items = await Department.find(filter).sort({ name: 1 });
  return items.map((d) => ({
    Code: d.code,
    Name: d.name,
    Description: d.description,
    Status: d.status,
    'Created On': d.createdAt ? d.createdAt.toISOString().slice(0, 10) : '',
  }));
}
