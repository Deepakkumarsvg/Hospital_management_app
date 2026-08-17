import { InsuranceClaim, CLAIM_TRANSITIONS } from '../models/InsuranceClaim.js';
import { ClaimDocument, CLAIM_DOCUMENT_CATEGORIES } from '../models/ClaimDocument.js';
import { Invoice } from '../models/Invoice.js';
import { recordPayment } from './billingService.js';
import { Patient } from '../models/Patient.js';
import { ApiError } from '../utils/ApiError.js';
import { removeObject } from '../config/storage.js';

const POPULATE = [
  { path: 'patient', select: 'uhid firstName lastName' },
  { path: 'invoice', select: 'invoiceNo grandTotal dueAmount' },
  { path: 'createdBy', select: 'name' },
];

export async function listClaims({ page, limit, search, status, patient, invoice }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (patient) filter.patient = patient;
  if (invoice) filter.invoice = invoice;
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

export async function changeStatus(id, { status, approvedAmount, note }, userId) {
  const claim = await InsuranceClaim.findById(id);
  if (!claim) throw ApiError.notFound('Claim not found', 'CLAIM_NOT_FOUND');

  const from = claim.status;
  const allowed = CLAIM_TRANSITIONS[from] || [];
  if (!allowed.includes(status)) {
    throw ApiError.badRequest(`Cannot change status from ${from} to ${status}`, 'INVALID_STATUS_TRANSITION');
  }

  const changes = { status };
  if (status === 'APPROVED') {
    if (approvedAmount === undefined) throw ApiError.badRequest('Approved amount is required', 'APPROVED_AMOUNT_REQUIRED');
    if (approvedAmount > claim.claimAmount) throw ApiError.badRequest('Approved amount cannot exceed claim amount', 'APPROVED_EXCEEDS_CLAIM');
    changes.approvedAmount = approvedAmount;
    changes.rejectedAmount = Math.round((claim.claimAmount - approvedAmount) * 100) / 100;
  }
  if (status === 'REJECTED') {
    changes.approvedAmount = 0;
    changes.rejectedAmount = claim.claimAmount;
  }
  if (status === 'DRAFT') {
    // Reopening a rejected claim for correction — clear the stale outcome.
    changes.approvedAmount = 0;
    changes.rejectedAmount = 0;
  }

  // Requiring the status to still be what we validated against makes the
  // transition atomic: two clerks settling the same claim at once cannot both
  // get through and post the settlement payment twice.
  const updated = await InsuranceClaim.findOneAndUpdate(
    { _id: id, status: from },
    { $set: changes, $push: { history: { status, by: userId, note: note || '' } } },
    { new: true }
  );
  if (!updated) {
    throw ApiError.conflict(
      'This claim was updated by someone else — reload and try again',
      'CLAIM_CHANGED'
    );
  }

  // Settling an approved claim posts an INSURANCE payment against the invoice.
  //
  // This goes through recordPayment rather than adjusting the invoice by hand:
  // that is the only path where the overpayment rule and the paid/due/status
  // recalculation happen in a single atomic update, so a settlement landing at
  // the same moment as a cash payment can't overshoot the total or lose one of
  // the two. The claim number doubles as the payment's transaction id, which
  // the unique index turns into idempotency — a replayed settlement is
  // rejected rather than banked twice.
  if (status === 'SETTLED' && updated.invoice && updated.approvedAmount > 0) {
    const invoice = await Invoice.findById(updated.invoice).select('status dueAmount');
    if (invoice && !['CANCELLED', 'REFUNDED'].includes(invoice.status)) {
      const pay = Math.min(updated.approvedAmount, invoice.dueAmount);
      if (pay > 0) {
        await recordPayment(
          updated.invoice,
          { amount: pay, method: 'INSURANCE', transactionId: updated.claimNo, note: 'Insurance settlement' },
          userId
        ).catch((err) => {
          // The claim is settled either way; a payment that was already
          // recorded is the expected outcome of a retry, not a failure.
          if (err?.errorCode !== 'PAYMENT_ALREADY_RECORDED') throw err;
        });
      }
    }
  }
  return updated.populate(POPULATE);
}

// Claim documents (pre-auth letters, discharge summaries, bills, policy copies)
export async function listClaimDocuments(claimId) {
  return ClaimDocument.find({ claim: claimId }).populate('uploadedBy', 'name').sort({ createdAt: -1 });
}

export async function createClaimDocument(claimId, file, category, userId) {
  const claim = await InsuranceClaim.findById(claimId).select('_id');
  if (!claim) throw ApiError.notFound('Claim not found', 'CLAIM_NOT_FOUND');
  const cat = CLAIM_DOCUMENT_CATEGORIES.includes(category) ? category : 'OTHER';
  return ClaimDocument.create({
    claim: claimId,
    category: cat,
    originalName: file.originalname,
    storageKey: file.storageKey,
    mimeType: file.mimetype,
    size: file.size,
    uploadedBy: userId,
  });
}

export async function getClaimDocument(claimId, docId) {
  const doc = await ClaimDocument.findOne({ _id: docId, claim: claimId });
  if (!doc) throw ApiError.notFound('Document not found', 'DOCUMENT_NOT_FOUND');
  return doc;
}

export async function deleteClaimDocument(claimId, docId) {
  const doc = await ClaimDocument.findOneAndDelete({ _id: docId, claim: claimId });
  if (!doc) throw ApiError.notFound('Document not found', 'DOCUMENT_NOT_FOUND');
  await removeObject(doc.storageKey);
  return doc;
}

export async function insuranceStats() {
  const rows = await InsuranceClaim.aggregate([
    { $group: { _id: null, claimed: { $sum: '$claimAmount' }, approved: { $sum: '$approvedAmount' }, rejected: { $sum: '$rejectedAmount' } } },
  ]);
  const agg = rows[0] || { claimed: 0, approved: 0, rejected: 0 };
  const [pending, settled] = await Promise.all([
    InsuranceClaim.countDocuments({ status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] } }),
    InsuranceClaim.countDocuments({ status: 'SETTLED' }),
  ]);
  return { claimed: agg.claimed, approved: agg.approved, rejected: agg.rejected, pending, settled };
}
