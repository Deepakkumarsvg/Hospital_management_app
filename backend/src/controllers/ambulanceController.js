import { z } from 'zod';
import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/ambulanceService.js';

export const listAmbulances = asyncHandler(async (_req, res) => sendSuccess(res, { message: 'Ambulances', data: await service.listAmbulances() }));
export const createAmbulance = asyncHandler(async (req, res) => sendSuccess(res, { statusCode: 201, message: 'Ambulance added', data: await service.createAmbulance(req.body) }));
export const updateAmbulance = asyncHandler(async (req, res) => sendSuccess(res, { message: 'Ambulance updated', data: await service.updateAmbulance(req.params.id, req.body) }));
export const deleteAmbulance = asyncHandler(async (req, res) => { await service.deleteAmbulance(req.params.id); sendSuccess(res, { message: 'Ambulance deleted', data: null }); });

export const listTrips = asyncHandler(async (_req, res) => sendSuccess(res, { message: 'Trips', data: await service.listTrips() }));
export const stats = asyncHandler(async (_req, res) => sendSuccess(res, { message: 'Ambulance stats', data: await service.ambulanceStats() }));
export const startTrip = asyncHandler(async (req, res) => sendSuccess(res, { statusCode: 201, message: 'Trip started', data: await service.startTrip(req.body, req.user?._id) }));
export const endTrip = asyncHandler(async (req, res) => sendSuccess(res, { message: 'Trip closed', data: await service.endTrip(req.params.id, req.body.status) }));

// Inline validators (small module).
export const ambulanceSchema = z.object({
  vehicleNo: z.string().trim().min(2).max(20).toUpperCase(),
  type: z.enum(['BASIC', 'ADVANCED', 'ICU']).optional(),
  driverName: z.string().trim().max(120).optional(),
  driverPhone: z.string().trim().max(20).optional(),
  status: z.enum(['AVAILABLE', 'ON_TRIP', 'MAINTENANCE']).optional(),
});
export const tripSchema = z.object({
  ambulance: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ambulance'),
  patientName: z.string().trim().max(120).optional(),
  pickup: z.string().trim().max(200).optional(),
  drop: z.string().trim().max(200).optional(),
  purpose: z.string().trim().max(200).optional(),
  charges: z.coerce.number().min(0).optional(),
});
export const tripStatusSchema = z.object({ status: z.enum(['COMPLETED', 'CANCELLED']) });
