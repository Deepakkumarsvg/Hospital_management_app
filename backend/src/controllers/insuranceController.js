import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/insuranceService.js';

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listClaims(req.query);
  sendSuccess(res, { message: 'Claims', data: items, meta: pagination });
});
export const stats = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Insurance stats', data: await service.insuranceStats() }));
export const get = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Claim', data: await service.getClaim(req.params.id) }));
export const create = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: 201, message: 'Claim created', data: await service.createClaim(req.body, req.user?._id) }));
export const update = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Claim updated', data: await service.updateClaim(req.params.id, req.body) }));
export const changeStatus = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: `Claim ${req.body.status}`, data: await service.changeStatus(req.params.id, req.body, req.user?._id) }));
