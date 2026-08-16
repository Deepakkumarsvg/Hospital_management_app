import api from './api.js';
import { downloadFile, openPdf } from '../utils/download.js';

// Employees
export async function listEmployees(params = {}) {
  const { data } = await api.get('/hr/employees', { params });
  return { items: data.data, pagination: data.pagination };
}
export const activeEmployees = () => api.get('/hr/employees/active').then((r) => r.data.data);
export const getEmployee = (id) => api.get(`/hr/employees/${id}`).then((r) => r.data.data);
export const createEmployee = (p) => api.post('/hr/employees', p).then((r) => r.data.data);
export const updateEmployee = (id, p) => api.put(`/hr/employees/${id}`, p).then((r) => r.data.data);
export const deleteEmployee = (id) => api.delete(`/hr/employees/${id}`).then((r) => r.data);
export function exportEmployees({ search, department, status } = {}, format = 'csv') {
  const date = new Date().toISOString().slice(0, 10);
  return downloadFile('/hr/employees/export', `employees-${date}.${format}`, { search, department, status, format });
}

// Attendance
export async function listAttendance(params = {}) {
  const { data } = await api.get('/hr/attendance', { params });
  return { items: data.data, pagination: data.pagination };
}
export const markAttendance = (p) => api.post('/hr/attendance', p).then((r) => r.data.data);
export const markAttendanceBulk = (p) => api.post('/hr/attendance/bulk', p).then((r) => r.data.data);
export const getMonthlyAttendanceSummary = (month, year) => api.get('/hr/attendance/summary', { params: { month, year } }).then((r) => r.data.data);
export function exportAttendance({ from, to, employee, status } = {}, format = 'csv') {
  const date = new Date().toISOString().slice(0, 10);
  return downloadFile('/hr/attendance/export', `attendance-${date}.${format}`, { from, to, employee, status, format });
}

// Leaves
export async function listLeaves(params = {}) {
  const { data } = await api.get('/hr/leaves', { params });
  return { items: data.data, pagination: data.pagination };
}
export const createLeave = (p) => api.post('/hr/leaves', p).then((r) => r.data.data);
export const decideLeave = (id, status) => api.patch(`/hr/leaves/${id}/status`, { status }).then((r) => r.data.data);
export function exportLeaves({ status, employee, from, to } = {}, format = 'csv') {
  const date = new Date().toISOString().slice(0, 10);
  return downloadFile('/hr/leaves/export', `leaves-${date}.${format}`, { status, employee, from, to, format });
}

// Payroll
export const generatePayroll = (month, year) => api.post('/hr/payroll/generate', { month, year }).then((r) => r.data.data);
export async function listPayslips(params = {}) {
  const { data } = await api.get('/hr/payslips', { params });
  return { items: data.data, pagination: data.pagination };
}
export const getPayslip = (id) => api.get(`/hr/payslips/${id}`).then((r) => r.data.data);
export const getPayrollByDepartment = (month, year) => api.get('/hr/payroll/by-department', { params: { month, year } }).then((r) => r.data.data);
export const adjustPayslip = (id, p) => api.put(`/hr/payslips/${id}/adjust`, p).then((r) => r.data.data);
export const markPayslipPaid = (id) => api.patch(`/hr/payslips/${id}/pay`).then((r) => r.data.data);
export function exportPayslips({ month, year, employee, status } = {}, format = 'csv') {
  const date = new Date().toISOString().slice(0, 10);
  return downloadFile('/hr/payslips/export', `payslips-${date}.${format}`, { month, year, employee, status, format });
}
export const downloadPayslipPdf = (id, payslipNo) => openPdf(`/hr/payslips/${id}/pdf`, `${payslipNo || 'payslip'}.pdf`);

export const getHrStats = () => api.get('/hr/stats').then((r) => r.data.data);
