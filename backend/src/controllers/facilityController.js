import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/facilityService.js';

// ---- Wards ----
export const listWards = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Wards', data: await service.listWards() }));
export const createWard = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: 201, message: 'Ward created', data: await service.createWard(req.body) }));
export const updateWard = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Ward updated', data: await service.updateWard(req.params.id, req.body) }));
export const deleteWard = asyncHandler(async (req, res) => {
  await service.deleteWard(req.params.id);
  sendSuccess(res, { message: 'Ward deleted', data: null });
});

// ---- Rooms ----
export const listRooms = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Rooms', data: await service.listRooms(req.query.ward) }));
export const createRoom = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: 201, message: 'Room created', data: await service.createRoom(req.body) }));
export const updateRoom = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Room updated', data: await service.updateRoom(req.params.id, req.body) }));
export const deleteRoom = asyncHandler(async (req, res) => {
  await service.deleteRoom(req.params.id);
  sendSuccess(res, { message: 'Room deleted', data: null });
});

// ---- Beds ----
export const listBeds = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Beds', data: await service.listBeds(req.query) }));
export const availableBeds = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Available beds', data: await service.availableBeds(req.query.ward) }));
export const bedMap = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Bed map', data: await service.bedMap() }));
export const createBed = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: 201, message: 'Bed created', data: await service.createBed(req.body) }));
export const updateBed = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Bed updated', data: await service.updateBed(req.params.id, req.body) }));
export const deleteBed = asyncHandler(async (req, res) => {
  await service.deleteBed(req.params.id);
  sendSuccess(res, { message: 'Bed deleted', data: null });
});
