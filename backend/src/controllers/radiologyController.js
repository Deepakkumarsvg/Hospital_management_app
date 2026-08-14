import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/radiologyService.js';

// ---- Test master ----
export const listTests = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Radiology tests', data: await service.listTests(req.query) }));
export const activeTests = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Active tests', data: await service.activeTests() }));
export const createTest = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: 201, message: 'Test created', data: await service.createTest(req.body) }));
export const updateTest = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Test updated', data: await service.updateTest(req.params.id, req.body) }));
export const deleteTest = asyncHandler(async (req, res) => {
  await service.deleteTest(req.params.id);
  sendSuccess(res, { message: 'Test deleted', data: null });
});

// ---- Orders ----
export const listOrders = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listOrders(req.query);
  sendSuccess(res, { message: 'Radiology orders', data: items, meta: pagination });
});
export const stats = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Radiology stats', data: await service.radStats() }));
export const getOrder = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Radiology order', data: await service.getOrder(req.params.id) }));
export const createOrder = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: 201, message: 'Radiology order created', data: await service.createOrder(req.body, req.user?._id) }));
export const changeStatus = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: `Order marked ${req.body.status}`, data: await service.changeStatus(req.params.id, req.body.status, req.body.scheduledAt) }));
export const submitReport = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Report submitted', data: await service.submitReport(req.params.id, req.body, req.user?._id) }));
