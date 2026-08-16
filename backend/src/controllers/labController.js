import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/labService.js';
import { getSettings } from '../services/settingService.js';
import { generateLabReportPdf } from '../utils/pdf.js';
import { sendCsv, sendExcel } from '../utils/exporters.js';
import { notify } from '../services/notificationService.js';
import { audit } from '../utils/audit.js';

// ---- Test master ----
export const listTests = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Lab tests', data: await service.listTests(req.query) }));
export const activeTests = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Active tests', data: await service.activeTests() }));
export const createTest = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: 201, message: 'Test created', data: await service.createTest(req.body) }));
export const updateTest = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Test updated', data: await service.updateTest(req.params.id, req.body) }));
export const deleteTest = asyncHandler(async (req, res) => {
  const t = await service.deleteTest(req.params.id);
  audit(req, { action: 'DELETE', module: 'LabTest', recordId: t.code, description: `Deleted lab test ${t.name}` });
  sendSuccess(res, { message: 'Test deleted', data: null });
});

// ---- Orders ----
export const listOrders = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listOrders(req.query);
  sendSuccess(res, { message: 'Lab orders', data: items, meta: pagination });
});
export const stats = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Lab stats', data: await service.labStats() }));
export const getOrder = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Lab order', data: await service.getOrder(req.params.id) }));
export const createOrder = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: 201, message: 'Lab order created', data: await service.createOrder(req.body, req.user?._id) }));
export const changeStatus = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: `Order marked ${req.body.status}`, data: await service.changeStatus(req.params.id, req.body.status, req.user?._id) }));
export const enterResults = asyncHandler(async (req, res) => {
  const order = await service.enterResults(req.params.id, req.body.items);

  // Flag the ordering doctor if any result came back outside the normal range.
  const abnormal = (order.items || []).some((i) => i.flag && i.flag !== 'NORMAL');
  if (abnormal && order.doctor?.user) {
    notify({
      user: order.doctor.user, type: 'LAB', title: 'Abnormal lab result',
      message: `${order.orderNo} · ${order.patient?.firstName || 'Patient'} has an abnormal result — review required.`,
      link: `/laboratory/${order._id}`,
    });
  }

  sendSuccess(res, { message: 'Results saved', data: order });
});

// GET /api/laboratory/orders/export?format=csv|xlsx&search=&status=&patient=
export const exportOrders = asyncHandler(async (req, res) => {
  const rows = await service.labOrderRowsForExport(req.query);
  const name = `lab-orders-${new Date().toISOString().slice(0, 10)}`;
  if (req.query.format === 'xlsx') return sendExcel(res, name, rows, 'Lab Orders');
  return sendCsv(res, name, rows);
});

// GET /api/laboratory/orders/:id/pdf
export const orderPdf = asyncHandler(async (req, res) => {
  const [order, settings] = await Promise.all([
    service.getOrder(req.params.id),
    getSettings(),
  ]);
  await generateLabReportPdf(res, { order, settings });
});
