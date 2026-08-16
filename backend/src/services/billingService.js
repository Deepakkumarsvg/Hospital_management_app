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
  // Both preconditions live in the query: a payment landing at the same moment
  // as a cancellation must lose, not silently void a bill that has been paid.
  const invoice = await Invoice.findOneAndUpdate(
    { _id: id, status: { $nin: ['CANCELLED', 'REFUNDED'] }, paidAmount: { $lte: 0 } },
    [
      {
        $set: {
          status: 'CANCELLED',
          notes: reason
            ? {
                $cond: [
                  { $gt: [{ $strLenCP: { $ifNull: ['$notes', ''] } }, 0] },
                  { $concat: ['$notes', ' | Cancelled: ', reason] },
                  `Cancelled: ${reason}`,
                ],
              }
            : '$notes',
        },
      },
    ],
    { new: true }
  );

  if (!invoice) {
    const existing = await Invoice.findById(id).select('status paidAmount');
    if (!existing) throw ApiError.notFound('Invoice not found', 'INVOICE_NOT_FOUND');
    if (['CANCELLED', 'REFUNDED'].includes(existing.status)) {
      throw ApiError.badRequest(`Invoice is already ${existing.status.toLowerCase()}`, 'ALREADY_CLOSED');
    }
    throw ApiError.badRequest('Refund the payment before cancelling this invoice', 'INVOICE_HAS_PAYMENTS');
  }

  return invoice.populate(POPULATE);
}

// Refund some or all of what's been paid. Recorded as its own Payment
// (type: REFUND) for a full, symmetric audit trail — never a silent
// subtraction. A refund that empties paidAmount closes the invoice as
// REFUNDED; a partial refund just lowers paidAmount and lets recompute()
// re-derive PARTIAL/PENDING normally.
export async function refundInvoice(id, { amount, method, reason }, userId) {
  // Same shape as recordPayment: the "can't refund more than was paid" rule
  // lives in the query, so two concurrent refunds can't both draw on the same
  // paid balance.
  const invoice = await Invoice.findOneAndUpdate(
    {
      _id: id,
      status: { $ne: 'CANCELLED' },
      $expr: { $lte: [amount, { $add: ['$paidAmount', EPSILON] }] },
      paidAmount: { $gt: 0 },
    },
    [
      { $set: { paidAmount: { $max: [0, { $round: [{ $subtract: ['$paidAmount', amount] }, 2] }] } } },
      DERIVE_TOTALS_STAGE,
      // A refund that empties the invoice closes it as REFUNDED rather than
      // dropping back to PENDING — the money went out, it isn't owed again.
      { $set: { status: { $cond: [{ $lte: ['$paidAmount', EPSILON] }, 'REFUNDED', '$status'] } } },
    ],
    { new: true }
  );

  if (!invoice) {
    const existing = await Invoice.findById(id).select('status paidAmount');
    if (!existing) throw ApiError.notFound('Invoice not found', 'INVOICE_NOT_FOUND');
    if (existing.status === 'CANCELLED') throw ApiError.badRequest('Cannot refund a cancelled invoice', 'INVOICE_CANCELLED');
    if (existing.paidAmount <= 0) throw ApiError.badRequest('Nothing has been paid on this invoice', 'NOTHING_PAID');
    throw ApiError.badRequest(`Refund cannot exceed the amount paid (₹${existing.paidAmount})`, 'REFUND_EXCEEDS_PAID');
  }

  try {
    // Recorded as its own Payment (type: REFUND) for a full, symmetric audit
    // trail — never a silent subtraction.
    const payment = await Payment.create({
      invoice: invoice._id, patient: invoice.patient,
      amount, type: 'REFUND', method: method || 'CASH', note: reason || '', receivedBy: userId,
    });
    return { invoice: await invoice.populate(POPULATE), payment };
  } catch (err) {
    await Invoice.findByIdAndUpdate(id, [
      { $set: { paidAmount: { $round: [{ $add: ['$paidAmount', amount] }, 2] } } },
      DERIVE_TOTALS_STAGE,
    ]).catch(() => {});
    throw err;
  }
}

// Money comparisons carry float noise, so "equal" means "within half a paisa".
const EPSILON = 0.005;

// Re-derive dueAmount and status from whatever paidAmount ends up being. Runs
// as a stage of the same update pipeline as the paidAmount change, so the
// invoice is never observable in a state where the three disagree.
const DERIVE_TOTALS_STAGE = {
  $set: {
    dueAmount: { $round: [{ $subtract: ['$grandTotal', '$paidAmount'] }, 2] },
    status: {
      $switch: {
        branches: [
          { case: { $lte: ['$paidAmount', EPSILON] }, then: 'PENDING' },
          { case: { $lt: ['$paidAmount', { $subtract: ['$grandTotal', EPSILON] }] }, then: 'PARTIAL' },
        ],
        default: 'PAID',
      },
    },
  },
};

// Record a payment and roll it up into the invoice.
//
// The invoice is updated FIRST, with the overpayment rule expressed as part of
// the query. Reading the invoice, checking the due amount and then writing
// would let two concurrent payments each see the full amount outstanding and
// both go through.
export async function recordPayment(invoiceId, data, userId) {
  const invoice = await Invoice.findOneAndUpdate(
    {
      _id: invoiceId,
      status: { $nin: ['REFUNDED', 'CANCELLED'] },
      // paidAmount + amount must not exceed the grand total.
      $expr: { $lte: [{ $add: ['$paidAmount', data.amount] }, { $add: ['$grandTotal', EPSILON] }] },
    },
    [
      { $set: { paidAmount: { $round: [{ $add: ['$paidAmount', data.amount] }, 2] } } },
      DERIVE_TOTALS_STAGE,
    ],
    { new: true }
  );

  if (!invoice) {
    // Nothing matched — work out which rule turned it down.
    const existing = await Invoice.findById(invoiceId).select('status dueAmount');
    if (!existing) throw ApiError.notFound('Invoice not found', 'INVOICE_NOT_FOUND');
    if (['REFUNDED', 'CANCELLED'].includes(existing.status)) {
      throw ApiError.badRequest(`Cannot pay a ${existing.status.toLowerCase()} invoice`, 'INVOICE_LOCKED');
    }
    throw ApiError.badRequest(`Amount exceeds due (₹${existing.dueAmount})`, 'OVERPAYMENT');
  }

  try {
    const payment = await Payment.create({
      invoice: invoice._id, patient: invoice.patient,
      amount: data.amount, method: data.method || 'CASH',
      transactionId: data.transactionId || '', note: data.note || '', receivedBy: userId,
    });
    return { invoice: await invoice.populate(POPULATE), payment };
  } catch (err) {
    // The receipt is what makes the payment auditable. If it can't be written,
    // the invoice must not claim the money was received.
    await Invoice.findByIdAndUpdate(invoiceId, [
      { $set: { paidAmount: { $round: [{ $subtract: ['$paidAmount', data.amount] }, 2] } } },
      DERIVE_TOTALS_STAGE,
    ]).catch(() => {});

    // A duplicate transactionId means this exact gateway payment has already
    // been banked — the client's verify call and the webhook both arrived.
    // That's an expected race, not a failure, so it gets its own code.
    if (err?.code === 11000 && err.keyPattern?.transactionId) {
      throw ApiError.conflict(
        'This payment has already been recorded',
        'PAYMENT_ALREADY_RECORDED',
        { transactionId: data.transactionId }
      );
    }
    throw err;
  }
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
