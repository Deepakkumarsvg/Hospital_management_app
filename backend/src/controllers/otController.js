import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/otService.js';

export const listTheatres = asyncHandler(async (_req, res) => sendSuccess(res, { message: 'Theatres', data: await service.listTheatres() }));
export const activeTheatres = asyncHandler(async (_req, res) => sendSuccess(res, { message: 'Active theatres', data: await service.activeTheatres() }));
export const createTheatre = asyncHandler(async (req, res) => sendSuccess(res, { statusCode: 201, message: 'Theatre created', data: await service.createTheatre(req.body) }));
export const updateTheatre = asyncHandler(async (req, res) => sendSuccess(res, { message: 'Theatre updated', data: await service.updateTheatre(req.params.id, req.body) }));
export const deleteTheatre = asyncHandler(async (req, res) => { await service.deleteTheatre(req.params.id); sendSuccess(res, { message: 'Theatre deleted', data: null }); });

export const listSurgeries = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listSurgeries(req.query);
  sendSuccess(res, { message: 'Surgeries', data: items, meta: pagination });
});
export const stats = asyncHandler(async (_req, res) => sendSuccess(res, { message: 'OT stats', data: await service.otStats() }));
export const getSurgery = asyncHandler(async (req, res) => sendSuccess(res, { message: 'Surgery', data: await service.getSurgery(req.params.id) }));
export const createSurgery = asyncHandler(async (req, res) => sendSuccess(res, { statusCode: 201, message: 'Surgery scheduled', data: await service.createSurgery(req.body, req.user?._id) }));
export const updateSurgery = asyncHandler(async (req, res) => sendSuccess(res, { message: 'Surgery updated', data: await service.updateSurgery(req.params.id, req.body) }));
export const changeStatus = asyncHandler(async (req, res) => sendSuccess(res, { message: `Surgery ${req.body.status}`, data: await service.changeStatus(req.params.id, req.body.status) }));
