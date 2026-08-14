import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/hrService.js';

export const listEmployees = asyncHandler(async (req, res) => sendSuccess(res, { message: 'Employees', data: await service.listEmployees(req.query) }));
export const activeEmployees = asyncHandler(async (_req, res) => sendSuccess(res, { message: 'Active employees', data: await service.activeEmployees() }));
export const stats = asyncHandler(async (_req, res) => sendSuccess(res, { message: 'HR stats', data: await service.hrStats() }));
export const createEmployee = asyncHandler(async (req, res) => sendSuccess(res, { statusCode: 201, message: 'Employee added', data: await service.createEmployee(req.body) }));
export const updateEmployee = asyncHandler(async (req, res) => sendSuccess(res, { message: 'Employee updated', data: await service.updateEmployee(req.params.id, req.body) }));
export const deleteEmployee = asyncHandler(async (req, res) => { await service.deleteEmployee(req.params.id); sendSuccess(res, { message: 'Employee deleted', data: null }); });

export const markAttendance = asyncHandler(async (req, res) => sendSuccess(res, { statusCode: 201, message: 'Attendance marked', data: await service.markAttendance(req.body) }));
export const listAttendance = asyncHandler(async (req, res) => sendSuccess(res, { message: 'Attendance', data: await service.listAttendance(req.query) }));

export const listLeaves = asyncHandler(async (req, res) => sendSuccess(res, { message: 'Leaves', data: await service.listLeaves(req.query) }));
export const createLeave = asyncHandler(async (req, res) => sendSuccess(res, { statusCode: 201, message: 'Leave requested', data: await service.createLeave(req.body) }));
export const decideLeave = asyncHandler(async (req, res) => sendSuccess(res, { message: `Leave ${req.body.status}`, data: await service.decideLeave(req.params.id, req.body.status, req.user?._id) }));
