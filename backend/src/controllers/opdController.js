import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/opdService.js';
import { getSettings } from '../services/settingService.js';
import { generatePrescriptionPdf } from '../utils/pdf.js';

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listVisits(req.query);
  sendSuccess(res, { message: 'OPD visits fetched', data: items, meta: pagination });
});

export const stats = asyncHandler(async (_req, res) => {
  sendSuccess(res, { message: 'OPD stats', data: await service.opdStats() });
});

export const get = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'OPD visit fetched', data: await service.getVisit(req.params.id) });
});

// POST /api/opd/allergy-check  { patientId, medicines: [name, ...] }
export const allergyCheck = asyncHandler(async (req, res) => {
  const { patientId, medicines = [] } = req.body || {};
  const data = await service.checkAllergies(patientId, medicines);
  sendSuccess(res, { message: 'Allergy check', data });
});

export const prescriptionPdf = asyncHandler(async (req, res) => {
  const [visit, settings] = await Promise.all([
    service.getVisit(req.params.id),
    getSettings(),
  ]);
  generatePrescriptionPdf(res, { visit, settings });
});

export const create = asyncHandler(async (req, res) => {
  const visit = await service.createVisit(req.body, req.user?._id);
  sendSuccess(res, { statusCode: 201, message: 'OPD visit created', data: visit });
});

export const update = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'OPD visit updated', data: await service.updateVisit(req.params.id, req.body) });
});

export const remove = asyncHandler(async (req, res) => {
  await service.deleteVisit(req.params.id);
  sendSuccess(res, { message: 'OPD visit deleted', data: null });
});
