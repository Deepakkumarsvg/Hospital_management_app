import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/depositService.js';
import { audit } from '../utils/audit.js';
import { toRupees } from '../utils/money.js';

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listDeposits(req.query);
  sendSuccess(res, { message: 'Deposits', data: items, meta: pagination });
});

export const get = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Deposit', data: await service.getDeposit(req.params.id) }));

// What this patient is holding right now — the number read out at the counter.
export const balance = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Advance balance', data: await service.balanceFor(req.params.patientId) }));

export const collect = asyncHandler(async (req, res) => {
  const deposit = await service.collect(req.body, req.user?._id);
  audit(req, {
    action: 'PAYMENT', module: 'Deposit', recordId: deposit.depositNo,
    description: `Advance ₹${toRupees(deposit.amount)} collected`,
  });
  sendSuccess(res, { statusCode: 201, message: 'Advance collected', data: deposit });
});

export const topUp = asyncHandler(async (req, res) => {
  const deposit = await service.topUp(req.params.id, req.body, req.user?._id);
  audit(req, {
    action: 'PAYMENT', module: 'Deposit', recordId: deposit.depositNo,
    description: `Advance topped up by ₹${toRupees(req.body.amount)} · balance ₹${toRupees(deposit.available)}`,
  });
  sendSuccess(res, { message: 'Advance topped up', data: deposit });
});

export const apply = asyncHandler(async (req, res) => {
  const deposit = await service.applyToInvoice(req.params.id, req.body.invoice, req.body.amount, req.user?._id);
  audit(req, {
    action: 'PAYMENT', module: 'Deposit', recordId: deposit.depositNo,
    description: `Advance applied to an invoice · ₹${toRupees(deposit.available)} left`,
  });
  sendSuccess(res, { message: 'Applied to invoice', data: deposit });
});

export const refund = asyncHandler(async (req, res) => {
  const deposit = await service.refund(req.params.id, req.body.amount, req.user?._id, req.body.note);
  audit(req, {
    action: 'PAYMENT', module: 'Deposit', recordId: deposit.depositNo,
    description: `Advance refunded · ₹${toRupees(deposit.refunded)} returned in total`,
  });
  sendSuccess(res, { message: 'Refunded', data: deposit });
});

export const close = asyncHandler(async (req, res) => {
  const deposit = await service.close(req.params.id, req.user?._id);
  audit(req, {
    action: 'UPDATE', module: 'Deposit', recordId: deposit.depositNo,
    description: 'Advance closed',
  });
  sendSuccess(res, { message: 'Deposit closed', data: deposit });
});
