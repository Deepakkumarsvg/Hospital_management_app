import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/pharmacyService.js';

export const listMedicines = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listMedicines(req.query);
  sendSuccess(res, { message: 'Medicines', data: items, meta: pagination });
});
export const activeMedicines = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Active medicines', data: await service.activeMedicines() }));
export const getMedicine = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Medicine', data: await service.getMedicine(req.params.id) }));
export const createMedicine = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: 201, message: 'Medicine created', data: await service.createMedicine(req.body) }));
export const updateMedicine = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Medicine updated', data: await service.updateMedicine(req.params.id, req.body) }));
export const deleteMedicine = asyncHandler(async (req, res) => {
  await service.deleteMedicine(req.params.id);
  sendSuccess(res, { message: 'Medicine deleted', data: null });
});

export const receiveBatch = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: 201, message: 'Stock received', data: await service.receiveBatch(req.params.id, req.body, req.user?._id) }));

export const dispense = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: 201, message: 'Medicines dispensed', data: await service.dispense(req.body, req.user?._id) }));
export const listDispenses = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listDispenses(req.query);
  sendSuccess(res, { message: 'Dispenses', data: items, meta: pagination });
});

export const expiring = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Expiring batches', data: await service.expiringBatches(Number(req.query.days) || 90) }));
export const stats = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Pharmacy stats', data: await service.pharmacyStats() }));
