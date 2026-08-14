import { Invoice } from '../models/Invoice.js';
import { Payment } from '../models/Payment.js';
import { Patient } from '../models/Patient.js';
import { LabOrder } from '../models/LabOrder.js';
import { RadiologyOrder } from '../models/RadiologyOrder.js';
import { MedicineDispense } from '../models/MedicineDispense.js';
import { ApiError } from '../utils/ApiError.js';

const POPULATE = [
  { path: 'patient', select: 'uhid firstName lastName phone' },
  { path: 'createdBy', select: 'name' },
];

export async function listInvoices({ page, limit, search, status, patient }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (patient) filter.patient = patient;
  if (search) filter.invoiceNo = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  const [items, total] = await Promise.all([
    Invoice.find(filter).populate(POPULATE).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Invoice.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function getInvoice(id) {
  const invoice = await Invoice.findById(id).populate(POPULATE);
  if (!invoice) throw ApiError.notFound('Invoice not found', 'INVOICE_NOT_FOUND');
  const payments = await Payment.find({ invoice: id }).populate('receivedBy', 'name').sort({ createdAt: -1 });
  return { invoice, payments };
}

export async function createInvoice(data, userId) {
  const patient = await Patient.findById(data.patient).select('_id');
  if (!patient) throw ApiError.badRequest('Patient does not exist', 'PATIENT_NOT_FOUND');

  const invoice = new Invoice({
    patient: data.patient,
    items: data.items.map((it) => ({ ...it, quantity: it.quantity || 1 })),
    discount: data.discount || 0,
    taxPercent: data.taxPercent || 0,
    notes: data.notes || '',
    createdBy: userId,
  });
  invoice.recompute();
  await invoice.save();
  return invoice.populate(POPULATE);
}

export async function updateInvoice(id, data) {
  const invoice = await Invoice.findById(id);
  if (!invoice) throw ApiError.notFound('Invoice not found', 'INVOICE_NOT_FOUND');
  if (['PAID', 'REFUNDED', 'CANCELLED'].includes(invoice.status) && data.items) {
    throw ApiError.badRequest(`Cannot edit line items of a ${invoice.status.toLowerCase()} invoice`, 'INVOICE_LOCKED');
  }
  if (data.items) invoice.items = data.items.map((it) => ({ ...it, quantity: it.quantity || 1 }));
  if (data.discount !== undefined) invoice.discount = data.discount;
  if (data.taxPercent !== undefined) invoice.taxPercent = data.taxPercent;
  if (data.notes !== undefined) invoice.notes = data.notes;
  if (data.status) invoice.status = data.status; // REFUNDED / CANCELLED
  invoice.recompute();
  await invoice.save();
  return invoice.populate(POPULATE);
}

// Record a payment and roll it up into the invoice.
export async function recordPayment(invoiceId, data, userId) {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw ApiError.notFound('Invoice not found', 'INVOICE_NOT_FOUND');
  if (['REFUNDED', 'CANCELLED'].includes(invoice.status)) {
    throw ApiError.badRequest(`Cannot pay a ${invoice.status.toLowerCase()} invoice`, 'INVOICE_LOCKED');
  }
  if (data.amount > invoice.dueAmount + 0.001) {
    throw ApiError.badRequest(`Amount exceeds due (₹${invoice.dueAmount})`, 'OVERPAYMENT');
  }

  const payment = new Payment({
    invoice: invoice._id, patient: invoice.patient,
    amount: data.amount, method: data.method || 'CASH',
    transactionId: data.transactionId || '', note: data.note || '', receivedBy: userId,
  });
  await payment.save();

  invoice.paidAmount = Math.round((invoice.paidAmount + data.amount) * 100) / 100;
  invoice.recompute();
  await invoice.save();
  return { invoice: await invoice.populate(POPULATE), payment };
}

// Suggested billable lines drawn from the patient's diagnostics & pharmacy.
export async function billingSuggestions(patientId) {
  const [labs, rads, dispenses] = await Promise.all([
    LabOrder.find({ patient: patientId, status: { $ne: 'CANCELLED' } }),
    RadiologyOrder.find({ patient: patientId, status: { $ne: 'CANCELLED' } }),
    MedicineDispense.find({ patient: patientId }),
  ]);
  const suggestions = [];
  for (const l of labs) {
    const amt = (l.items || []).reduce((s, i) => s + (i.price || 0), 0);
    if (amt > 0) suggestions.push({ category: 'LABORATORY', description: `Lab · ${l.orderNo}`, quantity: 1, unitPrice: amt });
  }
  for (const r of rads) {
    if (r.price > 0) suggestions.push({ category: 'RADIOLOGY', description: `${r.testName} · ${r.orderNo}`, quantity: 1, unitPrice: r.price });
  }
  for (const d of dispenses) {
    if (d.total > 0) suggestions.push({ category: 'MEDICINE', description: `Pharmacy · ${d.dispenseNo}`, quantity: 1, unitPrice: d.total });
  }
  return suggestions;
}

export async function billingStats() {
  const rows = await Invoice.aggregate([
    { $match: { status: { $nin: ['CANCELLED'] } } },
    { $group: { _id: null, billed: { $sum: '$grandTotal' }, collected: { $sum: '$paidAmount' }, due: { $sum: '$dueAmount' } } },
  ]);
  const agg = rows[0] || { billed: 0, collected: 0, due: 0 };
  const pending = await Invoice.countDocuments({ status: { $in: ['PENDING', 'PARTIAL'] } });
  return { billed: agg.billed, collected: agg.collected, due: agg.due, pendingInvoices: pending };
}
