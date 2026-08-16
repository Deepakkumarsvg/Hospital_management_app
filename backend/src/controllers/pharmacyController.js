import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/pharmacyService.js';
import { getSettings } from '../services/settingService.js';
import { generateDispenseReceiptPdf } from '../utils/pdf.js';
import { sendCsv, sendExcel } from '../utils/exporters.js';
import { audit } from '../utils/audit.js';

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
  const m = await service.deleteMedicine(req.params.id);
  audit(req, { action: 'DELETE', module: 'Medicine', recordId: m.name, description: `Deleted medicine ${m.name}` });
  sendSuccess(res, { message: 'Medicine deleted', data: null });
});

export const receiveBatch = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: 201, message: 'Stock received', data: await service.receiveBatch(req.params.id, req.body, req.user?._id) }));

export const adjustStock = asyncHandler(async (req, res) => {
  const m = await service.adjustStock(req.params.id, req.body, req.user?._id);
  audit(req, {
    action: 'ADJUST', module: 'Medicine', recordId: m.name,
    description: `${req.body.delta > 0 ? '+' : ''}${req.body.delta} ${m.name} — ${req.body.reason}`,
  });
  sendSuccess(res, { message: 'Stock adjusted', data: m });
});

export const dispense = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: 201, message: 'Medicines dispensed', data: await service.dispense(req.body, req.user?._id) }));
export const listDispenses = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listDispenses(req.query);
  sendSuccess(res, { message: 'Dispenses', data: items, meta: pagination });
});
export const getDispense = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Dispense', data: await service.getDispense(req.params.id) }));
export const returnDispense = asyncHandler(async (req, res) => {
  const d = await service.returnDispense(req.params.id, req.user?._id);
  audit(req, { action: 'UPDATE', module: 'Medicine', recordId: d.dispenseNo, description: `Returned dispense ${d.dispenseNo} — stock restored` });
  sendSuccess(res, { message: 'Dispense returned', data: d });
});

export const expiring = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Expiring batches', data: await service.expiringBatches(req.query.days) }));
export const stats = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Pharmacy stats', data: await service.pharmacyStats() }));

// GET /api/pharmacy/medicines/export?format=csv|xlsx&search=&status=&lowStock=
export const exportMedicines = asyncHandler(async (req, res) => {
  const rows = await service.medicineRowsForExport(req.query);
  const name = `medicines-${new Date().toISOString().slice(0, 10)}`;
  if (req.query.format === 'xlsx') return sendExcel(res, name, rows, 'Medicines');
  return sendCsv(res, name, rows);
});

// GET /api/pharmacy/dispenses/export?format=csv|xlsx&search=&patient=&doctor=
export const exportDispenses = asyncHandler(async (req, res) => {
  const rows = await service.dispenseRowsForExport(req.query);
  const name = `dispenses-${new Date().toISOString().slice(0, 10)}`;
  if (req.query.format === 'xlsx') return sendExcel(res, name, rows, 'Dispenses');
  return sendCsv(res, name, rows);
});

// GET /api/pharmacy/dispenses/:id/pdf
export const dispenseReceiptPdf = asyncHandler(async (req, res) => {
  const [dispense, settings] = await Promise.all([
    service.getDispense(req.params.id),
    getSettings(),
  ]);
  await generateDispenseReceiptPdf(res, { dispense, settings });
});
