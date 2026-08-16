import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/reportService.js';
import { getSettings } from '../services/settingService.js';
import { generateReportSummaryPdf } from '../utils/pdf.js';
import { sendCsv, sendExcel } from '../utils/exporters.js';

// GET /api/reports/summary?from=&to=
export const summary = asyncHandler(async (req, res) => {
  const data = await service.getSummary({ from: req.query.from, to: req.query.to });
  sendSuccess(res, { message: 'Report summary', data });
});

// GET /api/reports/doctor-activity?from=&to=
export const doctorActivity = asyncHandler(async (req, res) => {
  const data = await service.doctorActivity({ from: req.query.from, to: req.query.to });
  sendSuccess(res, { message: 'Doctor activity', data });
});

// GET /api/reports/export/summary?format=csv|xlsx&from=&to=
export const exportSummary = asyncHandler(async (req, res) => {
  const rows = await service.summaryRows({ from: req.query.from, to: req.query.to });
  const name = `hms-summary-${req.query.from || 'all'}_${req.query.to || 'all'}`;
  if (req.query.format === 'xlsx') return sendExcel(res, name, rows, 'Summary');
  return sendCsv(res, name, rows);
});

// GET /api/reports/export/summary/pdf?from=&to=
export const summaryPdf = asyncHandler(async (req, res) => {
  const [summary, settings] = await Promise.all([
    service.getSummary({ from: req.query.from, to: req.query.to }),
    getSettings(),
  ]);
  await generateReportSummaryPdf(res, { summary, settings });
});

// GET /api/reports/export/invoices?format=csv|xlsx&from=&to=
export const exportInvoices = asyncHandler(async (req, res) => {
  const rows = await service.invoiceRows({ from: req.query.from, to: req.query.to });
  const name = `invoices-${req.query.from || 'all'}_${req.query.to || 'all'}`;
  if (req.query.format === 'xlsx') return sendExcel(res, name, rows, 'Invoices');
  return sendCsv(res, name, rows);
});

// GET /api/reports/export/doctor-activity?format=csv|xlsx&from=&to=
export const exportDoctorActivity = asyncHandler(async (req, res) => {
  const rows = await service.doctorActivity({ from: req.query.from, to: req.query.to });
  const name = `doctor-activity-${req.query.from || 'all'}_${req.query.to || 'all'}`;
  if (req.query.format === 'xlsx') return sendExcel(res, name, rows, 'Doctor Activity');
  return sendCsv(res, name, rows);
});
