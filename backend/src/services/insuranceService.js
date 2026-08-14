import { InsuranceClaim, CLAIM_TRANSITIONS } from '../models/InsuranceClaim.js';
import { Invoice } from '../models/Invoice.js';
import { Payment } from '../models/Payment.js';
import { Patient } from '../models/Patient.js';
import { ApiError } from '../utils/ApiError.js';

const POPULATE = [
  { path: 'patient', select: 'uhid firstName lastName' },
  { path: 'invoice', select: 'invoiceNo grandTotal dueAmount' },
  { path: 'createdBy', select: 'name' },
];

export async function listClaims({ page, limit, search, status, patient }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (patient) filter.patient = patient;
  if (search) filter.claimNo = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  const [items, total] = await Promise.all([
    InsuranceClaim.find(filter).populate(POPULATE).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    InsuranceClaim.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function getClaim(id) {
  const claim = await InsuranceClaim.findById(id).populate([...POPULATE, { path: 'history.by', select: 'name' }]);
  if (!claim) throw ApiError.notFound('Claim not found', 'CLAIM_NOT_FOUND');
  return claim;
}

export async function createClaim(data, userId) {
  const patient = await Patient.findById(data.patient).select('insurance');
  if (!patient) throw ApiError.badRequest('Patient does not exist', 'PATIENT_NOT_FOUND');

  const claim = new InsuranceClaim({
    ...data,
    // Fall back to the patient's stored policy if not provided.
    policyNumber: data.policyNumber || patient.insurance?.policyNumber || '',
    status: 'DRAFT',
    history: [{ status: 'DRAFT', by: userId }],
    createdBy: userId,
  });
  await claim.save();
  return claim.populate(POPULATE);
}

export async function updateClaim(id, data) {
  const claim = await InsuranceClaim.findById(id);
  if (!claim) throw ApiError.notFound('Claim not found', 'CLAIM_NOT_FOUND');
  if (claim.status !== 'DRAFT') throw ApiError.badRequest('Only draft claims can be edited', 'CLAIM_LOCKED');
  Object.assign(claim, data);
  await claim.save();
  return claim.populate(POPULATE);
}

export async function changeStatus(id, { status, approvedAmount }, userId) {
  const claim = await InsuranceClaim.findById(id);
  if (!claim) throw ApiError.notFound('Claim not found', 'CLAIM_NOT_FOUND');

  const allowed = CLAIM_TRANSITIONS[claim.status] || [];
  if (!allowed.includes(status)) {
    throw ApiError.badRequest(`Cannot change status from ${claim.status} to ${status}`, 'INVALID_STATUS_TRANSITION');
  }

  if (status === 'APPROVED') {
    if (approvedAmount === undefined) throw ApiError.badRequest('Approved amount is required', 'APPROVED_AMOUNT_REQUIRED');
    if (approvedAmount > claim.claimAmount) throw ApiError.badRequest('Approved amount cannot exceed claim amount', 'APPROVED_EXCEEDS_CLAIM');
    claim.approvedAmount = approvedAmount;
    claim.rejectedAmount = Math.round((claim.claimAmount - approvedAmount) * 100) / 100;
  }
  if (status === 'REJECTED') {
    claim.approvedAmount = 0;
    claim.rejectedAmount = claim.claimAmount;
  }

  claim.status = status;
  claim.history.push({ status, by: userId });
  await claim.save();

  // Settling an approved claim posts an INSURANCE payment against the invoice.
  if (status === 'SETTLED' && claim.invoice && claim.approvedAmount > 0) {
    const invoice = await Invoice.findById(claim.invoice);
    if (invoice && !['CANCELLED', 'REFUNDED'].includes(invoice.status)) {
      const pay = Math.min(claim.approvedAmount, invoice.dueAmount);
      if (pay > 0) {
        await Payment.create({ invoice: invoice._id, patient: invoice.patient, amount: pay, method: 'INSURANCE', transactionId: claim.claimNo, note: 'Insurance settlement', receivedBy: userId });
        invoice.paidAmount = Math.round((invoice.paidAmount + pay) * 100) / 100;
        invoice.recompute();
        await invoice.save();
      }
    }
  }
  return claim.populate(POPULATE);
}

export async function insuranceStats() {
  const rows = await InsuranceClaim.aggregate([
    { $group: { _id: null, claimed: { $sum: '$claimAmount' }, approved: { $sum: '$approvedAmount' } } },
  ]);
  const agg = rows[0] || { claimed: 0, approved: 0 };
  const pending = await InsuranceClaim.countDocuments({ status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] } });
  return { claimed: agg.claimed, approved: agg.approved, pending };
}
