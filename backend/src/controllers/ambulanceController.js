import { z } from 'zod';
import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/ambulanceService.js';
import { getSettings } from '../services/settingService.js';
import { generateAmbulanceReceiptPdf } from '../utils/pdf.js';
import { sendCsv, sendExcel } from '../utils/exporters.js';
import { audit } from '../utils/audit.js';
import { TRIP_STATUSES } from '../models/AmbulanceTrip.js';

export const listAmbulances = asyncHandler(async (_req, res) => sendSuccess(res, { message: 'Ambulances', data: await service.listAmbulances() }));
export const createAmbulance = asyncHandler(async (req, res) => sendSuccess(res, { statusCode: 201, message: 'Ambulance added', data: await service.createAmbulance(req.body) }));
export const updateAmbulance = asyncHandler(async (req, res) => sendSuccess(res, { message: 'Ambulance updated', data: await service.updateAmbulance(req.params.id, req.body) }));
export const deleteAmbulance = asyncHandler(async (req, res) => {
  const a = await service.deleteAmbulance(req.params.id);
  audit(req, { action: 'DELETE', module: 'Ambulance', recordId: a.vehicleNo, description: `Deleted ambulance ${a.vehicleNo}` });
  sendSuccess(res, { message: 'Ambulance deleted', data: null });
});

export const listTrips = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listTrips(req.query);
  sendSuccess(res, { message: 'Trips', data: items, meta: pagination });
});
export const stats = asyncHandler(async (_req, res) => sendSuccess(res, { message: 'Ambulance stats', data: await service.ambulanceStats() }));
export const startTrip = asyncHandler(async (req, res) => sendSuccess(res, { statusCode: 201, message: 'Trip started', data: await service.startTrip(req.body, req.user?._id) }));
export const updateTrip = asyncHandler(async (req, res) => sendSuccess(res, { message: 'Trip updated', data: await service.updateTrip(req.params.id, req.body) }));
export const endTrip = asyncHandler(async (req, res) => sendSuccess(res, { message: 'Trip closed', data: await service.endTrip(req.params.id, req.body.status) }));

// GET /api/ambulance/trips/export?format=csv|xlsx&search=&status=&ambulance=
export const exportTrips = asyncHandler(async (req, res) => {
  const rows = await service.tripRowsForExport(req.query);
  const name = `ambulance-trips-${new Date().toISOString().slice(0, 10)}`;
  if (req.query.format === 'xlsx') return sendExcel(res, name, rows, 'Trips');
  return sendCsv(res, name, rows);
});

// GET /api/ambulance/trips/:id/pdf
export const tripReceiptPdf = asyncHandler(async (req, res) => {
  const [trip, settings] = await Promise.all([service.getTrip(req.params.id), getSettings()]);
  generateAmbulanceReceiptPdf(res, { trip, settings });
});

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
  patient: z.string().regex(/^[0-9a-fA-F]{24}$/).optional().nullable(),
  patientName: z.string().trim().max(120).optional(),
  driverName: z.string().trim().max(120).optional(),
  driverPhone: z.string().trim().max(20).optional(),
  pickup: z.string().trim().max(200).optional(),
  drop: z.string().trim().max(200).optional(),
  purpose: z.string().trim().max(200).optional(),
  charges: z.coerce.number().min(0).optional(),
});
export const updateTripSchema = z.object({
  driverName: z.string().trim().max(120).optional(),
  driverPhone: z.string().trim().max(20).optional(),
  pickup: z.string().trim().max(200).optional(),
  drop: z.string().trim().max(200).optional(),
  purpose: z.string().trim().max(200).optional(),
  charges: z.coerce.number().min(0).optional(),
});
export const tripStatusSchema = z.object({ status: z.enum(['COMPLETED', 'CANCELLED']) });

export const listTripsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().default(''),
  status: z.enum([...TRIP_STATUSES, 'ALL']).optional().default('ALL'),
  ambulance: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
});
export const exportTripsQuerySchema = z.object({
  search: z.string().trim().optional().default(''),
  status: z.enum([...TRIP_STATUSES, 'ALL']).optional().default('ALL'),
  ambulance: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  format: z.enum(['csv', 'xlsx']).optional().default('csv'),
});
