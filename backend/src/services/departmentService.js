import { Department } from '../models/Department.js';
import { ApiError } from '../utils/ApiError.js';

export async function listDepartments({ page, limit, search, status }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { code: rx }];
  }
  const [items, total] = await Promise.all([
    Department.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit),
    Department.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
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
  const dep = await Department.findByIdAndDelete(id);
  if (!dep) throw ApiError.notFound('Department not found', 'DEPARTMENT_NOT_FOUND');
  return dep;
}
