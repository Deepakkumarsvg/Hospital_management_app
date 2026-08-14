import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/departmentService.js';

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listDepartments(req.query);
  sendSuccess(res, { message: 'Departments fetched', data: items, meta: pagination });
});

export const active = asyncHandler(async (_req, res) => {
  const items = await service.activeDepartments();
  sendSuccess(res, { message: 'Active departments', data: items });
});

export const get = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Department fetched', data: await service.getDepartment(req.params.id) });
});

export const create = asyncHandler(async (req, res) => {
  const dep = await service.createDepartment(req.body);
  sendSuccess(res, { statusCode: 201, message: 'Department created', data: dep });
});

export const update = asyncHandler(async (req, res) => {
  const dep = await service.updateDepartment(req.params.id, req.body);
  sendSuccess(res, { message: 'Department updated', data: dep });
});

export const remove = asyncHandler(async (req, res) => {
  await service.deleteDepartment(req.params.id);
  sendSuccess(res, { message: 'Department deleted', data: null });
});
