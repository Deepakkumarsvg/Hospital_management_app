import mongoose from 'mongoose';
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
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    // Match on invoice number directly, or on the billed patient's name/UHID.
    const matchingPatients = await Patient.find({ $or: [{ firstName: rx }, { lastName: rx }, { uhid: rx }] }).select('_id');
    filter.$or = [{ invoiceNo: rx }, { patient: { $in: matchingPatients.map((p) => p._id) } }];
  }

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

// Items/discount/tax change the invoice's grand total — once any money has
// actually changed hands (paidAmount > 0) or the invoice is closed, those
// numbers must stay frozen. Refund first (via refundInvoice) if a correction
// is needed after payment. Only `notes` is exempt, since it carries no math.
export async function updateInvoice(id, data) {
  const invoice = await Invoice.findById(id);
  if (!invoice) throw ApiError.notFound('Invoice not found', 'INVOICE_NOT_FOUND');

  const changesMath = data.items !== undefined || data.discount !== undefined || data.taxPercent !== undefined;
  if (changesMath) {
    if (['REFUNDED', 'CANCELLED'].includes(invoice.status)) {
      throw ApiError.badRequest(`Cannot edit a ${invoice.status.toLowerCase()} invoice`, 'INVOICE_LOCKED');
    }
    if (invoice.paidAmount > 0) {
      throw ApiError.badRequest('Cannot change items, discount or tax after a payment has been recorded — refund first', 'INVOICE_HAS_PAYMENTS');
    }
  }

  if (data.items) invoice.items = data.items.map((it) => ({ ...it, quantity: it.quantity || 1 }));
  if (data.discount !== undefined) invoice.discount = data.discount;
  if (data.taxPercent !== undefined) invoice.taxPercent = data.taxPercent;
  if (data.notes !== undefined) invoice.notes = data.notes;
  invoice.recompute();
  await invoice.save();
  return invoice.populate(POPULATE);
}

// Void an invoice that nothing has been paid against yet. If any payment
// exists, it must be refunded first — cancelling is not a way to erase a
// paid bill.
export async function cancelInvoice(id, reason) {
  const invoice = await Invoice.findById(id);
  if (!invoice) throw ApiError.notFound('Invoice not found', 'INVOICE_NOT_FOUND');
  if (['CANCELLED', 'REFUNDED'].includes(invoice.status)) {
    throw ApiError.badRequest(`Invoice is already ${invoice.status.toLowerCase()}`, 'ALREADY_CLOSED');
  }
  if (invoice.paidAmount > 0) {
    throw ApiError.badRequest('Refund the payment before cancelling this invoice', 'INVOICE_HAS_PAYMENTS');
  }
  invoice.status = 'CANCELLED';
  if (reason) invoice.notes = invoice.notes ? `${invoice.notes} | Cancelled: ${reason}` : `Cancelled: ${reason}`;
  invoice.recompute();
  await invoice.save();
  return invoice.populate(POPULATE);
}

// Refund some or all of what's been paid. Recorded as its own Payment
// (type: REFUND) for a full, symmetric audit trail — never a silent
// subtraction. A refund that empties paidAmount closes the invoice as
// REFUNDED; a partial refund just lowers paidAmount and lets recompute()
// re-derive PARTIAL/PENDING normally.
export async function refundInvoice(id, { amount, method, reason }, userId) {
  const invoice = await Invoice.findById(id);
  if (!invoice) throw ApiError.notFound('Invoice not found', 'INVOICE_NOT_FOUND');
  if (invoice.status === 'CANCELLED') throw ApiError.badRequest('Cannot refund a cancelled invoice', 'INVOICE_CANCELLED');
  if (invoice.paidAmount <= 0) throw ApiError.badRequest('Nothing has been paid on this invoice', 'NOTHING_PAID');
  if (amount > invoice.paidAmount + 0.001) {
    throw ApiError.badRequest(`Refund cannot exceed the amount paid (₹${invoice.paidAmount})`, 'REFUND_EXCEEDS_PAID');
  }

  const payment = new Payment({
    invoice: invoice._id, patient: invoice.patient,
    amount, type: 'REFUND', method: method || 'CASH', note: reason || '', receivedBy: userId,
  });
  await payment.save();

  invoice.paidAmount = Math.max(0, Math.round((invoice.paidAmount - amount) * 100) / 100);
  if (invoice.paidAmount <= 0.001) {
    invoice.paidAmount = 0;
    invoice.status = 'REFUNDED';
  }
  invoice.recompute();
  await invoice.save();
  return { invoice: await invoice.populate(POPULATE), payment };
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

// Suggested billable lines drawn from the patient's diagnostics & pharmacy —
// excludes anything already billed on a non-cancelled invoice, so re-opening
// "Add suggested charges" can't double-bill the same lab order/dispense.
export async function billingSuggestions(patientId) {
  const [labs, rads, dispenses, billedRows] = await Promise.all([
    LabOrder.find({ patient: patientId, status: { $ne: 'CANCELLED' } }),
    RadiologyOrder.find({ patient: patientId, status: { $ne: 'CANCELLED' } }),
    MedicineDispense.find({ patient: patientId }),
    Invoice.aggregate([
      { $match: { patient: new mongoose.Types.ObjectId(patientId), status: { $ne: 'CANCELLED' } } },
      { $unwind: '$items' },
      { $match: { 'items.sourceId': { $ne: null } } },
      { $group: { _id: null, ids: { $addToSet: '$items.sourceId' } } },
    ]),
  ]);
  const billed = new Set((billedRows[0]?.ids || []).map(String));

  const suggestions = [];
  for (const l of labs) {
    if (billed.has(String(l._id))) continue;
    const amt = (l.items || []).reduce((s, i) => s + (i.price || 0), 0);
    if (amt > 0) suggestions.push({ category: 'LABORATORY', description: `Lab · ${l.orderNo}`, quantity: 1, unitPrice: amt, sourceType: 'LAB_ORDER', sourceId: l._id });
  }
  for (const r of rads) {
    if (billed.has(String(r._id))) continue;
    if (r.price > 0) suggestions.push({ category: 'RADIOLOGY', description: `${r.testName} · ${r.orderNo}`, quantity: 1, unitPrice: r.price, sourceType: 'RAD_ORDER', sourceId: r._id });
  }
  for (const d of dispenses) {
    if (billed.has(String(d._id))) continue;
    if (d.total > 0) suggestions.push({ category: 'MEDICINE', description: `Pharmacy · ${d.dispenseNo}`, quantity: 1, unitPrice: d.total, sourceType: 'DISPENSE', sourceId: d._id });
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
