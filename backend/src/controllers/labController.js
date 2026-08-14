import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/labService.js';

// ---- Test master ----
export const listTests = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Lab tests', data: await service.listTests(req.query) }));
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
  sendSuccess(res, { message: 'Lab orders', data: items, meta: pagination });
});
export const stats = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Lab stats', data: await service.labStats() }));
export const getOrder = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Lab order', data: await service.getOrder(req.params.id) }));
export const createOrder = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: 201, message: 'Lab order created', data: await service.createOrder(req.body, req.user?._id) }));
export const changeStatus = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: `Order marked ${req.body.status}`, data: await service.changeStatus(req.params.id, req.body.status, req.user?._id) }));
export const enterResults = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Results saved', data: await service.enterResults(req.params.id, req.body.items) }));
