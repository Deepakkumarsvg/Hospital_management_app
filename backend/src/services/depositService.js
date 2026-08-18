import { Deposit } from '../models/Deposit.js';
import { Patient } from '../models/Patient.js';
import { Invoice } from '../models/Invoice.js';
import { IPDAdmission } from '../models/IPDAdmission.js';
import { ApiError } from '../utils/ApiError.js';
import { recordPayment } from './billingService.js';
import { toRupees } from '../utils/money.js';

const POPULATE = [
  { path: 'patient', select: 'uhid firstName lastName phone' },
  { path: 'admission', select: 'admissionNo status' },
  { path: 'createdBy', select: 'name' },
];

// Take an advance.
//
// Amounts arriving here are already paise — the validators convert at the HTTP
// boundary. See utils/money.js.
export async function collect(data, userId) {
  const patient = await Patient.exists({ _id: data.patient });
  if (!patient) throw ApiError.badRequest('Patient does not exist', 'PATIENT_NOT_FOUND');

  if (data.admission) {
    const admission = await IPDAdmission.findById(data.admission).select('patient status');
    if (!admission) throw ApiError.badRequest('Admission does not exist', 'IPD_NOT_FOUND');
    if (String(admission.patient) !== String(data.patient)) {
      throw ApiError.badRequest('That admission belongs to a different patient', 'DEPOSIT_PATIENT_MISMATCH');
    }
  }

  const deposit = new Deposit({
    patient: data.patient,
    admission: data.admission || null,
    amount: data.amount,
    movements: [{
      type: 'COLLECTED',
      amount: data.amount,
      method: data.method || 'CASH',
      reference: data.reference || '',
      note: data.note || '',
      by: userId,
    }],
    createdBy: userId,
  });
  await deposit.save();
  return deposit.populate(POPULATE);
}

// Add to an existing advance — the ward asks for another ₹50,000 as the stay
// runs on. A second deposit record would work too, but one running balance per
// admission is what the family is actually told at the counter.
export async function topUp(id, data, userId) {
  const deposit = await Deposit.findOneAndUpdate(
    { _id: id, status: { $ne: 'CLOSED' } },
    {
      $inc: { amount: data.amount },
      $set: { status: 'ACTIVE' },
      $push: {
        movements: {
          type: 'COLLECTED',
          amount: data.amount,
          method: data.method || 'CASH',
          reference: data.reference || '',
          note: data.note || '',
          by: userId,
        },
      },
    },
    { new: true }
  );
  if (!deposit) {
    const exists = await Deposit.exists({ _id: id });
    if (!exists) throw ApiError.notFound('Deposit not found', 'DEPOSIT_NOT_FOUND');
    throw ApiError.badRequest('This deposit is closed', 'DEPOSIT_CLOSED');
  }
  return deposit.populate(POPULATE);
}

// Draw the deposit down onto a bill.
//
// The available-balance rule lives in the query, so two clerks applying the
// same advance to two invoices at the same moment cannot both succeed — which
// is the whole reason this is not just an arithmetic helper.
export async function applyToInvoice(id, invoiceId, requested, userId) {
  const invoice = await Invoice.findById(invoiceId).select('status dueAmount patient invoiceNo');
  if (!invoice) throw ApiError.notFound('Invoice not found', 'INVOICE_NOT_FOUND');
  if (['CANCELLED', 'REFUNDED'].includes(invoice.status)) {
    throw ApiError.badRequest(`Cannot pay a ${invoice.status.toLowerCase()} invoice`, 'INVOICE_LOCKED');
  }
  if (invoice.dueAmount <= 0) {
    throw ApiError.badRequest('Nothing is due on this invoice', 'NOTHING_DUE');
  }

  const held = await Deposit.findById(id).select('patient amount applied refunded status');
  if (!held) throw ApiError.notFound('Deposit not found', 'DEPOSIT_NOT_FOUND');
  if (String(held.patient) !== String(invoice.patient)) {
    throw ApiError.badRequest('That deposit belongs to a different patient', 'DEPOSIT_PATIENT_MISMATCH');
  }

  // Never more than is owed, and never more than is held. Defaulting to the
  // smaller of the two is what a cashier does anyway.
  const amount = Math.min(requested || held.available, held.available, invoice.dueAmount);
  if (amount <= 0) {
    throw ApiError.badRequest('This deposit has nothing left to apply', 'DEPOSIT_EXHAUSTED');
  }

  // Reserve against the deposit FIRST. If the payment then fails, the
  // reservation is released below — the other order would let a payment be
  // banked against money the deposit no longer had.
  const reserved = await Deposit.findOneAndUpdate(
    {
      _id: id,
      status: { $ne: 'CLOSED' },
      $expr: { $gte: [{ $subtract: ['$amount', { $add: ['$applied', '$refunded'] }] }, amount] },
    },
    {
      $inc: { applied: amount },
      $push: {
        movements: { type: 'APPLIED', amount, invoice: invoice._id, by: userId, note: `Applied to ${invoice.invoiceNo}` },
      },
    },
    { new: true }
  );
  if (!reserved) {
    throw ApiError.conflict('The deposit balance changed — reload and try again', 'DEPOSIT_CHANGED');
  }

  try {
    // Goes through the normal payment path so the overpayment rule and the
    // paid/due/status recalculation happen exactly once, atomically, wherever
    // the money came from.
    await recordPayment(
      invoice._id,
      { amount, method: 'CASH', note: `Advance ${reserved.depositNo}` },
      userId
    );
  } catch (err) {
    // The bill was not credited, so the deposit must not say it was.
    await Deposit.updateOne(
      { _id: id },
      {
        $inc: { applied: -amount },
        $push: {
          movements: {
            type: 'COLLECTED', amount: 0, by: userId,
            note: `Reversed an application of ₹${toRupees(amount)} — payment failed: ${err?.message || 'unknown error'}`,
          },
        },
      }
    ).catch(() => {});
    throw err;
  }

  await settleStatus(id);
  return Deposit.findById(id).populate(POPULATE);
}

// Give back what was never used.
export async function refund(id, requested, userId, note = '') {
  // The real fields, not the virtual: available is computed, so selecting it
  // returns nothing and the amount below would come out NaN.
  const held = await Deposit.findById(id).select('amount applied refunded');
  if (!held) throw ApiError.notFound('Deposit not found', 'DEPOSIT_NOT_FOUND');

  const amount = requested || held.available;
  if (amount <= 0) throw ApiError.badRequest('There is nothing left to refund', 'DEPOSIT_EXHAUSTED');

  const deposit = await Deposit.findOneAndUpdate(
    {
      _id: id,
      $expr: { $gte: [{ $subtract: ['$amount', { $add: ['$applied', '$refunded'] }] }, amount] },
    },
    {
      $inc: { refunded: amount },
      $push: { movements: { type: 'REFUNDED', amount, by: userId, note } },
    },
    { new: true }
  );
  if (!deposit) {
    const current = await Deposit.findById(id).select('amount applied refunded');
    throw ApiError.badRequest(
      `Refund cannot exceed the unused balance (₹${toRupees(current?.available || 0)})`,
      'DEPOSIT_REFUND_EXCEEDS'
    );
  }

  await settleStatus(id);
  return Deposit.findById(id).populate(POPULATE);
}

// Keep the status honest about the balance.
async function settleStatus(id) {
  const deposit = await Deposit.findById(id).select('amount applied refunded status');
  if (!deposit) return;
  const available = deposit.amount - deposit.applied - deposit.refunded;

  const next = available <= 0 ? 'EXHAUSTED' : 'ACTIVE';
  if (deposit.status !== next && deposit.status !== 'CLOSED') {
    await Deposit.updateOne({ _id: id }, { status: next });
  }
}

// Close a deposit at discharge.
//
// Refuses while money is still held: an advance with a balance left is the
// patient's money, and closing the record would be the system quietly keeping
// it. Refund it first, or apply it to the final bill.
// `_userId` is accepted for symmetry with collect/topUp/refund, which all
// record `by: userId` on a movement. Closing records no movement yet, so it
// is deliberately unused rather than dropped: the controller already passes
// it, and a Deposit has no closedBy field to put it in. Add one and this
// becomes a real audit of who closed the deposit.
export async function close(id, _userId) {
  const deposit = await Deposit.findById(id);
  if (!deposit) throw ApiError.notFound('Deposit not found', 'DEPOSIT_NOT_FOUND');
  if (deposit.status === 'CLOSED') throw ApiError.badRequest('This deposit is already closed', 'DEPOSIT_CLOSED');

  if (deposit.available > 0) {
    throw ApiError.badRequest(
      `₹${toRupees(deposit.available)} is still held. Refund it or apply it to a bill before closing.`,
      'DEPOSIT_HAS_BALANCE',
      { available: toRupees(deposit.available) }
    );
  }

  deposit.status = 'CLOSED';
  deposit.closedAt = new Date();
  await deposit.save();
  return deposit.populate(POPULATE);
}

export async function listDeposits({ page = 1, limit = 20, patient, admission, status } = {}) {
  const filter = {};
  if (patient) filter.patient = patient;
  if (admission) filter.admission = admission;
  if (status && status !== 'ALL') filter.status = status;

  const [items, total] = await Promise.all([
    Deposit.find(filter).populate(POPULATE).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Deposit.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function getDeposit(id) {
  const deposit = await Deposit.findById(id).populate([...POPULATE, { path: 'movements.by', select: 'name' }]);
  if (!deposit) throw ApiError.notFound('Deposit not found', 'DEPOSIT_NOT_FOUND');
  return deposit;
}

// What this patient is holding right now — the number the counter reads out.
export async function balanceFor(patientId) {
  const rows = await Deposit.find({ patient: patientId, status: { $ne: 'CLOSED' } })
    .select('depositNo amount applied refunded admission');

  const available = rows.reduce((s, d) => s + Math.max(0, d.amount - d.applied - d.refunded), 0);
  return {
    available: toRupees(available),
    deposits: rows.map((d) => ({
      id: d._id,
      depositNo: d.depositNo,
      available: toRupees(Math.max(0, d.amount - d.applied - d.refunded)),
    })),
  };
}
