import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/hrService.js';
import { getSettings } from '../services/settingService.js';
import { generatePayslipPdf } from '../utils/pdf.js';
import { sendCsv, sendExcel } from '../utils/exporters.js';
import { audit } from '../utils/audit.js';

// ---- Employees ----
export const listEmployees = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listEmployees(req.query);
  sendSuccess(res, { message: 'Employees', data: items, meta: pagination });
});
export const activeEmployees = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Active employees', data: await service.activeEmployees() }));
export const stats = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'HR stats', data: await service.hrStats() }));
export const getEmployee = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Employee detail', data: await service.getEmployee(req.params.id) }));
export const createEmployee = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: 201, message: 'Employee added', data: await service.createEmployee(req.body) }));
export const updateEmployee = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Employee updated', data: await service.updateEmployee(req.params.id, req.body) }));
export const deleteEmployee = asyncHandler(async (req, res) => {
  const e = await service.deleteEmployee(req.params.id);
  audit(req, { action: 'DELETE', module: 'Employee', recordId: e.employeeCode, description: `Deleted employee ${e.name}` });
  sendSuccess(res, { message: 'Employee deleted', data: null });
});

// GET /api/hr/employees/export?format=csv|xlsx&search=&department=&status=
export const exportEmployees = asyncHandler(async (req, res) => {
  const rows = await service.employeeRowsForExport(req.query);
  const name = `employees-${new Date().toISOString().slice(0, 10)}`;
  if (req.query.format === 'xlsx') return sendExcel(res, name, rows, 'Employees');
  return sendCsv(res, name, rows);
});

// ---- Attendance ----
export const markAttendance = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: 201, message: 'Attendance marked', data: await service.markAttendance(req.body) }));
export const markAttendanceBulk = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Attendance marked', data: await service.markAttendanceBulk(req.body) }));
export const listAttendance = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listAttendance(req.query);
  sendSuccess(res, { message: 'Attendance', data: items, meta: pagination });
});
export const monthlyAttendanceSummary = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Monthly attendance', data: await service.monthlyAttendanceSummary({ month: Number(req.query.month), year: Number(req.query.year) }) }));

// GET /api/hr/attendance/export?format=csv|xlsx&from=&to=&employee=&status=
export const exportAttendance = asyncHandler(async (req, res) => {
  const rows = await service.attendanceRowsForExport(req.query);
  const name = `attendance-${new Date().toISOString().slice(0, 10)}`;
  if (req.query.format === 'xlsx') return sendExcel(res, name, rows, 'Attendance');
  return sendCsv(res, name, rows);
});

// ---- Leaves ----
export const listLeaves = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listLeaves(req.query);
  sendSuccess(res, { message: 'Leaves', data: items, meta: pagination });
});
export const createLeave = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: 201, message: 'Leave requested', data: await service.createLeave(req.body) }));
export const decideLeave = asyncHandler(async (req, res) => {
  const leave = await service.decideLeave(req.params.id, req.body.status, req.user?._id);
  audit(req, { action: 'UPDATE', module: 'Leave', recordId: leave.employee?.employeeCode, description: `${leave.employee?.name}'s ${leave.type.toLowerCase()} leave ${req.body.status.toLowerCase()}` });
  sendSuccess(res, { message: `Leave ${req.body.status}`, data: leave });
});

// GET /api/hr/leaves/export?format=csv|xlsx&status=&employee=&from=&to=
export const exportLeaves = asyncHandler(async (req, res) => {
  const rows = await service.leaveRowsForExport(req.query);
  const name = `leaves-${new Date().toISOString().slice(0, 10)}`;
  if (req.query.format === 'xlsx') return sendExcel(res, name, rows, 'Leaves');
  return sendCsv(res, name, rows);
});

// ---- Payroll ----
export const generatePayroll = asyncHandler(async (req, res) => {
  const payslips = await service.generatePayroll({ month: Number(req.body.month), year: Number(req.body.year) }, req.user?._id);
  audit(req, { action: 'CREATE', module: 'Payroll', recordId: `${req.body.month}/${req.body.year}`, description: `Generated payroll for ${payslips.length} employee(s)` });
  sendSuccess(res, { statusCode: 201, message: 'Payroll generated', data: payslips });
});
export const listPayslips = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listPayslips(req.query);
  sendSuccess(res, { message: 'Payslips', data: items, meta: pagination });
});
export const payrollByDepartment = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Payroll by department', data: await service.payrollByDepartment({ month: req.query.month, year: req.query.year }) }));
export const getPayslip = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Payslip', data: await service.getPayslip(req.params.id) }));
export const adjustPayslip = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Payslip adjusted', data: await service.adjustPayslip(req.params.id, req.body) }));
export const markPayslipPaid = asyncHandler(async (req, res) => {
  const p = await service.markPayslipPaid(req.params.id);
  audit(req, { action: 'PAYMENT', module: 'Payroll', recordId: p.payslipNo, description: `Paid ${p.employee?.name} — ${p.payslipNo}` });
  sendSuccess(res, { message: 'Marked paid', data: p });
});

// GET /api/hr/payslips/export?format=csv|xlsx&month=&year=&employee=&status=
export const exportPayslips = asyncHandler(async (req, res) => {
  const rows = await service.payslipRowsForExport(req.query);
  const name = `payslips-${new Date().toISOString().slice(0, 10)}`;
  if (req.query.format === 'xlsx') return sendExcel(res, name, rows, 'Payslips');
  return sendCsv(res, name, rows);
});

// GET /api/hr/payslips/:id/pdf
export const payslipPdf = asyncHandler(async (req, res) => {
  const [payslip, settings] = await Promise.all([service.getPayslip(req.params.id), getSettings()]);
  generatePayslipPdf(res, { payslip, settings });
});
