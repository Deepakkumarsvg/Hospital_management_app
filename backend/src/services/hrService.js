import { Employee } from '../models/Employee.js';
import { Attendance } from '../models/Attendance.js';
import { Leave } from '../models/Leave.js';
import { ApiError } from '../utils/ApiError.js';

// Employees
export async function listEmployees({ search } = {}) {
  const filter = {};
  if (search) {
    const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { employeeCode: rx }, { designation: rx }];
  }
  return Employee.find(filter).populate('department', 'name code').sort({ createdAt: -1 });
}
export const activeEmployees = () => Employee.find({ status: 'ACTIVE' }).sort({ name: 1 });
export const createEmployee = (data) => Employee.create(data);
export async function updateEmployee(id, data) {
  const e = await Employee.findByIdAndUpdate(id, data, { new: true, runValidators: true }).populate('department', 'name code');
  if (!e) throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');
  return e;
}
export async function deleteEmployee(id) {
  const e = await Employee.findByIdAndDelete(id);
  if (!e) throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');
  return e;
}

// Attendance (upsert per employee/day)
export async function markAttendance(data) {
  const employee = await Employee.findById(data.employee).select('_id');
  if (!employee) throw ApiError.badRequest('Employee does not exist', 'EMPLOYEE_NOT_FOUND');
  const day = new Date(data.date); day.setHours(0, 0, 0, 0);
  const rec = await Attendance.findOneAndUpdate(
    { employee: data.employee, date: day },
    { $set: { status: data.status, checkIn: data.checkIn || '', checkOut: data.checkOut || '', note: data.note || '' } },
    { new: true, upsert: true }
  ).populate('employee', 'name employeeCode');
  return rec;
}
export async function listAttendance({ date }) {
  const filter = {};
  if (date) { const d = new Date(date); d.setHours(0, 0, 0, 0); filter.date = d; }
  return Attendance.find(filter).populate('employee', 'name employeeCode designation').sort({ 'employee.name': 1 });
}

// Leaves
export async function listLeaves({ status } = {}) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  return Leave.find(filter).populate('employee', 'name employeeCode').sort({ createdAt: -1 });
}
export async function createLeave(data) {
  const employee = await Employee.findById(data.employee).select('_id');
  if (!employee) throw ApiError.badRequest('Employee does not exist', 'EMPLOYEE_NOT_FOUND');
  if (data.toDate < data.fromDate) throw ApiError.badRequest('End date is before start date', 'INVALID_DATES');
  return (await Leave.create(data)).populate('employee', 'name employeeCode');
}
export async function decideLeave(id, status, userId) {
  const leave = await Leave.findById(id);
  if (!leave) throw ApiError.notFound('Leave not found', 'LEAVE_NOT_FOUND');
  if (leave.status !== 'PENDING') throw ApiError.badRequest('Leave already decided', 'LEAVE_DECIDED');
  leave.status = status;
  leave.decidedBy = userId;
  await leave.save();
  return leave.populate('employee', 'name employeeCode');
}

export async function hrStats() {
  const [employees, pendingLeaves] = await Promise.all([
    Employee.countDocuments({ status: 'ACTIVE' }),
    Leave.countDocuments({ status: 'PENDING' }),
  ]);
  return { employees, pendingLeaves };
}
