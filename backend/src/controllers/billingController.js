import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/billingService.js';
import { getSettings } from '../services/settingService.js';
import { generateInvoicePdf } from '../utils/pdf.js';
import { audit } from '../utils/audit.js';
import { notify } from '../services/notificationService.js';
import { ROLES } from '../config/roles.js';

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listInvoices(req.query);
  sendSuccess(res, { message: 'Invoices', data: items, meta: pagination });
});
export const stats = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Billing stats', data: await service.billingStats() }));
export const get = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Invoice', data: await service.getInvoice(req.params.id) }));
export const pdf = asyncHandler(async (req, res) => {
  const [{ invoice, payments }, settings] = await Promise.all([
    service.getInvoice(req.params.id),
    getSettings(),
  ]);
  generateInvoicePdf(res, { invoice, payments, settings });
});
export const suggestions = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Suggestions', data: await service.billingSuggestions(req.params.patientId) }));
export const create = asyncHandler(async (req, res) => {
  const invoice = await service.createInvoice(req.body, req.user?._id);
  audit(req, { action: 'CREATE', module: 'Invoice', recordId: invoice.invoiceNo, description: `Invoice ${invoice.invoiceNo} · ₹${invoice.grandTotal}` });
  notify({ role: ROLES.ACCOUNTANT, type: 'BILLING', title: 'New invoice', message: `${invoice.invoiceNo} · ₹${invoice.grandTotal}`, link: '/billing' });
  sendSuccess(res, { statusCode: 201, message: 'Invoice created', data: invoice });
});
export const update = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Invoice updated', data: await service.updateInvoice(req.params.id, req.body) }));
export const pay = asyncHandler(async (req, res) => {
  const result = await service.recordPayment(req.params.id, req.body, req.user?._id);
  audit(req, { action: 'PAYMENT', module: 'Payment', recordId: result.payment.receiptNo, description: `₹${result.payment.amount} via ${result.payment.method} on ${result.invoice.invoiceNo}` });
  sendSuccess(res, { statusCode: 201, message: 'Payment recorded', data: result });
});
