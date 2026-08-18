import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/queueService.js';
import { audit } from '../utils/audit.js';

export const priorities = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Priority reasons', data: service.priorityOptions() }));

export const doctorQueue = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Queue', data: await service.doctorQueue(req.params.doctorId, req.query.day) }));

// The waiting-area screen. Deliberately thin and deliberately nameless — a
// public display is not the place for patient names.
export const board = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Display board', data: await service.displayBoard(req.query.day) }));

export const stats = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Queue stats', data: await service.queueStats(req.query.day) }));

export const issue = asyncHandler(async (req, res) => {
  const token = await service.issueToken(req.body, req.user?._id);
  audit(req, {
    action: 'CREATE', module: 'OpdToken', recordId: token.tokenLabel,
    description: `${token.tokenLabel} issued · ${token.type.toLowerCase()}`
      + (token.priority !== 'NONE' ? ` · priority: ${token.priority}` : ''),
  });
  sendSuccess(res, { statusCode: 201, message: `Token ${token.tokenLabel}`, data: token });
});

export const callNext = asyncHandler(async (req, res) => {
  const token = await service.callNext(req.params.doctorId, req.query.day, req.user?._id);
  sendSuccess(res, { message: `Calling ${token.tokenLabel}`, data: token });
});

export const callToken = asyncHandler(async (req, res) => {
  const token = await service.callToken(req.params.id, req.user?._id);
  sendSuccess(res, { message: `Calling ${token.tokenLabel}`, data: token });
});

export const start = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    message: 'Consultation started',
    data: await service.startConsultation(req.params.id, req.body.opdVisit || null),
  }));

export const complete = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Consultation complete', data: await service.completeToken(req.params.id) }));

export const skip = asyncHandler(async (req, res) => {
  const token = await service.skipToken(req.params.id, req.body.reason);
  audit(req, {
    action: 'UPDATE', module: 'OpdToken', recordId: token.tokenLabel,
    description: `${token.tokenLabel} skipped — ${token.notes}`,
  });
  sendSuccess(res, { message: 'Token skipped', data: token });
});
