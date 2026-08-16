import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/opdService.js';
import { getSettings } from '../services/settingService.js';
import { generatePrescriptionPdf } from '../utils/pdf.js';
import { sendCsv, sendExcel } from '../utils/exporters.js';

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listVisits(req.query);
  sendSuccess(res, { message: 'OPD visits fetched', data: items, meta: pagination });
});

export const stats = asyncHandler(async (_req, res) => {
  sendSuccess(res, { message: 'OPD stats', data: await service.opdStats() });
});

// GET /api/opd/export?format=csv|xlsx&search=&status=&doctor=&patient=&date=
export const exportVisits = asyncHandler(async (req, res) => {
  const rows = await service.opdRowsForExport(req.query);
  const name = `opd-visits-${new Date().toISOString().slice(0, 10)}`;
  if (req.query.format === 'xlsx') return sendExcel(res, name, rows, 'OPD Visits');
  return sendCsv(res, name, rows);
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
  await generatePrescriptionPdf(res, { visit, settings });
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
