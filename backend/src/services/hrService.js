import { Employee } from '../models/Employee.js';
import { Attendance } from '../models/Attendance.js';
import { Leave } from '../models/Leave.js';
import { Payslip } from '../models/Payslip.js';
import { ApiError } from '../utils/ApiError.js';
import { toPaise, toRupees } from '../utils/money.js';

// ---------- Employees ----------
export async function listEmployees({ page = 1, limit = 20, search, department, status } = {}) {
  const filter = {};
  if (department) filter.department = department;
  if (status && status !== 'ALL') filter.status = status;
  if (search) {
    const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { employeeCode: rx }, { designation: rx }];
  }
  const [items, total] = await Promise.all([
    Employee.find(filter).populate('department', 'name code').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Employee.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}
export const activeEmployees = () => Employee.find({ status: 'ACTIVE' }).sort({ name: 1 });

// Email/phone are optional but must not repeat — checked here (and backed by
// partial unique indexes) so the clash is reported as a readable conflict
// rather than a raw duplicate-key error.
async function assertNoDuplicateContact({ email, phone }, excludeId) {
  const checks = [];
  if (email) checks.push(['email', email.toLowerCase()]);
  if (phone) checks.push(['phone', phone.trim()]);
  for (const [field, value] of checks) {
    const filter = { [field]: value };
    if (excludeId) filter._id = { $ne: excludeId };
    const clash = await Employee.findOne(filter).select('name employeeCode');
    if (clash) {
      throw ApiError.conflict(
        `Another employee (${clash.name} · ${clash.employeeCode}) already uses this ${field}.`,
        'EMPLOYEE_DUPLICATE_CONTACT', { field, employee: clash.employeeCode }
      );
    }
  }
}

export async function createEmployee(data) {
  await assertNoDuplicateContact(data);
  return Employee.create(data);
}
export async function updateEmployee(id, data) {
  await assertNoDuplicateContact(data, id);
  const e = await Employee.findByIdAndUpdate(id, data, { new: true, runValidators: true }).populate('department', 'name code');
  if (!e) throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');
  return e;
}

// Everything about one employee in a single call — the flat tabs can't answer
// "show me this person's whole record" without three separate searches.
export async function getEmployee(id) {
  const employee = await Employee.findById(id).populate('department', 'name code');
  if (!employee) throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');
  const [attendance, leaves, payslips] = await Promise.all([
    Attendance.find({ employee: id }).sort({ date: -1 }).limit(60),
    Leave.find({ employee: id }).sort({ createdAt: -1 }).limit(30),
    Payslip.find({ employee: id }).sort({ year: -1, month: -1 }).limit(24),
  ]);
  // netPay is paise; this total is read by the client, so it goes out in rupees.
  const paidTotal = toRupees(payslips.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.netPay, 0));
  return {
    employee, attendance, leaves, payslips,
    stats: {
      attendanceRecords: attendance.length,
      leavesTaken: leaves.filter((l) => l.status === 'APPROVED').length,
      payslipsPaid: payslips.filter((p) => p.status === 'PAID').length,
      lifetimePaid: paidTotal,
    },
  };
}
export async function deleteEmployee(id) {
  const e = await Employee.findById(id);
  if (!e) throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');

  const [attCount, leaveCount, paySlipCount] = await Promise.all([
    Attendance.countDocuments({ employee: id }),
    Leave.countDocuments({ employee: id }),
    Payslip.countDocuments({ employee: id }),
  ]);
  if (attCount || leaveCount || paySlipCount) {
    throw ApiError.conflict(
      'This employee has attendance, leave or payroll history and cannot be deleted. Set their status to Inactive instead.',
      'EMPLOYEE_HAS_HISTORY',
      { attendance: attCount, leaves: leaveCount, payslips: paySlipCount }
    );
  }

  await Employee.findByIdAndDelete(id);
  return e;
}

export async function employeeRowsForExport({ search, department, status } = {}) {
  const { items } = await listEmployees({ page: 1, limit: 100000, search, department, status });
  return items.map((e) => ({
    Code: e.employeeCode, Name: e.name, Designation: e.designation, Department: e.department?.name || '',
    Shift: e.shift, Phone: e.phone, Email: e.email,
    'Joining Date': e.joiningDate ? e.joiningDate.toISOString().slice(0, 10) : '',
    Salary: e.salary, Status: e.status,
  }));
}

// ---------- Attendance ----------
function dayStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

export async function markAttendance(data) {
  const employee = await Employee.findById(data.employee).select('_id');
  if (!employee) throw ApiError.badRequest('Employee does not exist', 'EMPLOYEE_NOT_FOUND');
  const day = dayStart(data.date);
  const rec = await Attendance.findOneAndUpdate(
    { employee: data.employee, date: day },
    { $set: { status: data.status, checkIn: data.checkIn || '', checkOut: data.checkOut || '', note: data.note || '' } },
    { new: true, upsert: true }
  ).populate('employee', 'name employeeCode');
  return rec;
}

// Same status applied to every active employee for one day — the common
// "mark everyone present" case, without clicking through each row.
export async function markAttendanceBulk({ date, employeeIds, status }) {
  const day = dayStart(date);
  const ids = employeeIds?.length ? employeeIds : (await Employee.find({ status: 'ACTIVE' }).select('_id')).map((e) => e._id);
  await Promise.all(ids.map((id) =>
    Attendance.findOneAndUpdate({ employee: id, date: day }, { $set: { status } }, { upsert: true })
  ));
  return { marked: ids.length };
}

export async function listAttendance({ page = 1, limit = 100, date, from, to, employee, status } = {}) {
  const filter = {};
  if (employee) filter.employee = employee;
  if (status && status !== 'ALL') filter.status = status;
  if (date) filter.date = dayStart(date);
  else if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = dayStart(from);
    if (to) filter.date.$lte = dayStart(to);
  }
  const [items, total] = await Promise.all([
    Attendance.find(filter).populate('employee', 'name employeeCode designation').sort({ date: -1 }).skip((page - 1) * limit).limit(limit),
    Attendance.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function attendanceRowsForExport({ from, to, employee, status } = {}) {
  const { items } = await listAttendance({ page: 1, limit: 100000, from, to, employee, status });
  return items.map((a) => ({
    Employee: a.employee?.name || '', Code: a.employee?.employeeCode || '',
    Date: a.date.toISOString().slice(0, 10), Status: a.status, 'Check In': a.checkIn, 'Check Out': a.checkOut, Note: a.note,
  }));
}

// Present/absent/half-day/leave counts per active employee for one month —
// the number every payroll run and every "how's attendance this month"
// question actually needs.
export async function monthlyAttendanceSummary({ month, year }) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  const [employees, rows] = await Promise.all([
    Employee.find({ status: 'ACTIVE' }).select('name employeeCode').sort({ name: 1 }),
    Attendance.aggregate([
      { $match: { date: { $gte: start, $lte: end } } },
      { $group: { _id: { employee: '$employee', status: '$status' }, count: { $sum: 1 } } },
    ]),
  ]);
  const byEmployee = {};
  for (const r of rows) {
    const id = String(r._id.employee);
    (byEmployee[id] ||= {})[r._id.status] = r.count;
  }
  const daysInMonth = end.getDate();
  return employees.map((e) => {
    const counts = byEmployee[String(e._id)] || {};
    const present = counts.PRESENT || 0;
    const absent = counts.ABSENT || 0;
    const half = counts.HALF_DAY || 0;
    const leave = counts.LEAVE || 0;
    return {
      employee: { id: e._id, name: e.name, employeeCode: e.employeeCode },
      present, absent, halfDays: half, leaveDays: leave,
      unmarked: Math.max(0, daysInMonth - present - absent - half - leave),
    };
  });
}

// ---------- Leaves ----------
export async function listLeaves({ page = 1, limit = 50, status, employee, from, to } = {}) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (employee) filter.employee = employee;
  if (from || to) {
    filter.fromDate = {};
    if (from) filter.fromDate.$gte = new Date(from);
    if (to) filter.fromDate.$lte = new Date(to);
  }
  const [items, total] = await Promise.all([
    Leave.find(filter).populate('employee', 'name employeeCode').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Leave.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}
export async function createLeave(data) {
  const employee = await Employee.findById(data.employee);
  if (!employee) throw ApiError.badRequest('Employee does not exist', 'EMPLOYEE_NOT_FOUND');
  if (data.toDate < data.fromDate) throw ApiError.badRequest('End date is before start date', 'INVALID_DATES');
  const leave = await Leave.create(data);
  return leave.populate('employee', 'name employeeCode');
}
export async function decideLeave(id, status, userId) {
  const leave = await Leave.findById(id);
  if (!leave) throw ApiError.notFound('Leave not found', 'LEAVE_NOT_FOUND');
  if (leave.status !== 'PENDING') throw ApiError.badRequest('Leave already decided', 'LEAVE_DECIDED');

  if (status === 'APPROVED' && leave.type !== 'UNPAID') {
    const employee = await Employee.findById(leave.employee);
    const balance = employee?.leaveBalance?.[leave.type] ?? 0;
    if (balance < leave.days) {
      throw ApiError.badRequest(
        `Insufficient ${leave.type.toLowerCase()} leave balance (has ${balance}, requesting ${leave.days}). Approve as unpaid or reject instead.`,
        'INSUFFICIENT_LEAVE_BALANCE'
      );
    }
    employee.leaveBalance[leave.type] = balance - leave.days;
    await employee.save();
  }

  leave.status = status;
  leave.decidedBy = userId;
  await leave.save();
  return leave.populate('employee', 'name employeeCode');
}

export async function leaveRowsForExport({ status, employee, from, to } = {}) {
  const { items } = await listLeaves({ page: 1, limit: 100000, status, employee, from, to });
  return items.map((l) => ({
    Employee: l.employee?.name || '', Code: l.employee?.employeeCode || '', Type: l.type,
    From: l.fromDate.toISOString().slice(0, 10), To: l.toDate.toISOString().slice(0, 10),
    Days: l.days, Status: l.status, Reason: l.reason,
  }));
}

// ---------- Payroll ----------
const PAYSLIP_POPULATE = [{ path: 'employee', select: 'name employeeCode designation department' }];

// Generates (or refreshes still-GENERATED, never PAID) payslips for every
// active employee from that month's attendance — the standard "run payroll"
// action, safe to re-run before anyone's been marked paid.
export async function generatePayroll({ month, year }, userId) {
  const employees = await Employee.find({ status: 'ACTIVE' });
  const summary = await monthlyAttendanceSummary({ month, year });
  const summaryByEmployee = Object.fromEntries(summary.map((s) => [String(s.employee.id), s]));
  const daysInMonth = new Date(year, month, 0).getDate();

  // Read every existing payslip for the month up front, in one query.
  // This used to issue a findOne per employee inside the loop below — a
  // thousand-person hospital meant a thousand sequential round trips before
  // the first slip was written.
  const existingSlips = await Payslip.find({ month, year, employee: { $in: employees.map((e) => e._id) } });
  const existingByEmployee = new Map(existingSlips.map((p) => [String(p.employee), p]));

  const results = [];
  for (const emp of employees) {
    const existing = existingByEmployee.get(String(emp._id));
    if (existing?.status === 'PAID') { results.push(existing); continue; } // never overwrite a paid slip

    const s = summaryByEmployee[String(emp._id)] || { present: 0, absent: 0, halfDays: 0, leaveDays: 0, unmarked: daysInMonth };
    // Employee.salary is still rupees; the payslip stores paise. Converting
    // first means the pro-rata division happens in whole paise and rounds
    // exactly once, instead of accumulating a fraction of a rupee per day.
    const basicPaise = toPaise(emp.salary);
    const payableDays = s.present + s.leaveDays + s.halfDays * 0.5;
    const grossPay = daysInMonth ? Math.round((basicPaise * payableDays) / daysInMonth) : 0;
    const adjustment = existing?.adjustment || 0;
    const netPay = Math.max(0, grossPay + adjustment);

    const doc = await Payslip.findOneAndUpdate(
      { employee: emp._id, month, year },
      {
        $set: {
          basicSalary: basicPaise, workingDays: daysInMonth,
          presentDays: s.present, absentDays: s.absent, halfDays: s.halfDays, leaveDays: s.leaveDays, unmarkedDays: s.unmarked,
          grossPay, netPay, generatedBy: userId,
        },
      },
      { upsert: true, new: true }
    );
    results.push(doc);
  }
  return Payslip.find({ _id: { $in: results.map((r) => r._id) } }).populate(PAYSLIP_POPULATE).sort({ 'employee.name': 1 });
}

export async function listPayslips({ page = 1, limit = 50, month, year, employee, status } = {}) {
  const filter = {};
  if (month) filter.month = Number(month);
  if (year) filter.year = Number(year);
  if (employee) filter.employee = employee;
  if (status && status !== 'ALL') filter.status = status;
  const [items, total] = await Promise.all([
    Payslip.find(filter).populate(PAYSLIP_POPULATE).sort({ year: -1, month: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Payslip.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}
export async function getPayslip(id) {
  const p = await Payslip.findById(id).populate(PAYSLIP_POPULATE);
  if (!p) throw ApiError.notFound('Payslip not found', 'PAYSLIP_NOT_FOUND');
  return p;
}
export async function adjustPayslip(id, { adjustment, adjustmentNote }) {
  const p = await Payslip.findById(id);
  if (!p) throw ApiError.notFound('Payslip not found', 'PAYSLIP_NOT_FOUND');
  if (p.status === 'PAID') throw ApiError.badRequest('Cannot adjust a paid payslip', 'PAYSLIP_PAID');
  // Requests carry rupees; the payslip stores paise. See utils/money.js.
  const adjustmentPaise = toPaise(adjustment);
  p.adjustment = adjustmentPaise;
  p.adjustmentNote = adjustmentNote || '';
  p.netPay = Math.max(0, p.grossPay + adjustmentPaise);
  await p.save();
  return p.populate(PAYSLIP_POPULATE);
}
export async function markPayslipPaid(id) {
  const p = await Payslip.findById(id);
  if (!p) throw ApiError.notFound('Payslip not found', 'PAYSLIP_NOT_FOUND');
  if (p.status === 'PAID') throw ApiError.badRequest('Already marked paid', 'PAYSLIP_PAID');
  p.status = 'PAID';
  p.paidAt = new Date();
  await p.save();
  return p.populate(PAYSLIP_POPULATE);
}
// "What does each department cost us this month" — the flat payslip list
// can't answer it without manual tallying.
export async function payrollByDepartment({ month, year }) {
  const rows = await Payslip.aggregate([
    { $match: { month: Number(month), year: Number(year) } },
    { $lookup: { from: 'employees', localField: 'employee', foreignField: '_id', as: 'emp' } },
    { $unwind: '$emp' },
    { $lookup: { from: 'departments', localField: 'emp.department', foreignField: '_id', as: 'dept' } },
    { $group: {
      _id: { $ifNull: [{ $arrayElemAt: ['$dept.name', 0] }, 'Unassigned'] },
      employees: { $sum: 1 },
      gross: { $sum: '$grossPay' },
      net: { $sum: '$netPay' },
      paid: { $sum: { $cond: [{ $eq: ['$status', 'PAID'] }, '$netPay', 0] } },
    } },
    { $sort: { net: -1 } },
  ]);
  // Payslip amounts are paise and aggregation bypasses toJSON — convert here.
  return rows.map((r) => ({
    department: r._id, employees: r.employees,
    gross: toRupees(r.gross), net: toRupees(r.net), paid: toRupees(r.paid),
  }));
}

export async function payslipRowsForExport({ month, year, employee, status } = {}) {
  const { items } = await listPayslips({ page: 1, limit: 100000, month, year, employee, status });
  // Exports read the documents directly, so paise are converted here.
  return items.map((p) => ({
    'Payslip No': p.payslipNo, Employee: p.employee?.name || '', Code: p.employee?.employeeCode || '',
    Month: p.month, Year: p.year, 'Basic Salary': toRupees(p.basicSalary),
    Present: p.presentDays, Absent: p.absentDays, 'Half Days': p.halfDays, Leave: p.leaveDays,
    'Gross Pay': toRupees(p.grossPay), Adjustment: toRupees(p.adjustment),
    'Net Pay': toRupees(p.netPay), Status: p.status,
  }));
}

// ---------- Stats ----------
export async function hrStats() {
  const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
  const today = dayStart(new Date());
  const [employees, pendingLeaves, onLeaveToday, payrollPendingCount] = await Promise.all([
    Employee.countDocuments({ status: 'ACTIVE' }),
    Leave.countDocuments({ status: 'PENDING' }),
    Attendance.countDocuments({ date: today, status: 'LEAVE' }),
    Payslip.countDocuments({ status: 'GENERATED', createdAt: { $gte: startOfMonth } }),
  ]);
  return { employees, pendingLeaves, onLeaveToday, payrollPendingCount };
}
