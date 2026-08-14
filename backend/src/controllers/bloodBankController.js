import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/bloodBankService.js';

export const listDonors = asyncHandler(async (_req, res) => sendSuccess(res, { message: 'Donors', data: await service.listDonors() }));
export const createDonor = asyncHandler(async (req, res) => sendSuccess(res, { statusCode: 201, message: 'Donor added', data: await service.createDonor(req.body) }));
export const updateDonor = asyncHandler(async (req, res) => sendSuccess(res, { message: 'Donor updated', data: await service.updateDonor(req.params.id, req.body) }));
export const deleteDonor = asyncHandler(async (req, res) => { await service.deleteDonor(req.params.id); sendSuccess(res, { message: 'Donor deleted', data: null }); });

export const listUnits = asyncHandler(async (req, res) => sendSuccess(res, { message: 'Blood units', data: await service.listUnits(req.query) }));
export const stock = asyncHandler(async (_req, res) => sendSuccess(res, { message: 'Blood stock', data: await service.stock() }));
export const collectUnit = asyncHandler(async (req, res) => sendSuccess(res, { statusCode: 201, message: 'Unit collected', data: await service.collectUnit(req.body, req.user?._id) }));
export const issueUnit = asyncHandler(async (req, res) => sendSuccess(res, { message: 'Unit issued', data: await service.issueUnit(req.params.id, req.body.patient, req.user?._id) }));
export const discardUnit = asyncHandler(async (req, res) => sendSuccess(res, { message: 'Unit discarded', data: await service.discardUnit(req.params.id) }));
