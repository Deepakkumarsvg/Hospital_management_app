import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/ipdService.js';
import { getSettings } from '../services/settingService.js';
import { generateDischargeSummaryPdf } from '../utils/pdf.js';
import { sendCsv, sendExcel } from '../utils/exporters.js';

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listAdmissions(req.query);
  sendSuccess(res, { message: 'Admissions fetched', data: items, meta: pagination });
});

// GET /api/ipd/export?format=csv|xlsx&search=&status=&patient=
export const exportAdmissions = asyncHandler(async (req, res) => {
  const rows = await service.ipdRowsForExport(req.query);
  const name = `ipd-admissions-${new Date().toISOString().slice(0, 10)}`;
  if (req.query.format === 'xlsx') return sendExcel(res, name, rows, 'IPD Admissions');
  return sendCsv(res, name, rows);
});

export const stats = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'IPD stats', data: await service.ipdStats() }));

export const get = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Admission fetched', data: await service.getAdmission(req.params.id) }));

export const dischargePdf = asyncHandler(async (req, res) => {
  const [admission, settings] = await Promise.all([
    service.getAdmission(req.params.id),
    getSettings(),
  ]);
  await generateDischargeSummaryPdf(res, { admission, settings });
});

export const admit = asyncHandler(async (req, res) => {
  const adm = await service.admitPatient(req.body, req.user?._id);
  sendSuccess(res, { statusCode: 201, message: 'Patient admitted', data: adm });
});

export const update = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Admission updated', data: await service.updateAdmission(req.params.id, req.body) }));

export const addNote = asyncHandler(async (req, res) => {
  const adm = await service.addNursingNote(req.params.id, req.body.note, req.user?._id);
  sendSuccess(res, { statusCode: 201, message: 'Nursing note added', data: adm });
});

export const transfer = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Bed transferred', data: await service.transferBed(req.params.id, req.body.bed) }));

export const discharge = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Patient discharged', data: await service.dischargePatient(req.params.id, req.body) }));

export const cancel = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Admission cancelled', data: await service.cancelAdmission(req.params.id) }));
