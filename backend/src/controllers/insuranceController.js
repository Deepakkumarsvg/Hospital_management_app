import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/insuranceService.js';
import { removeObject } from '../config/storage.js';
import { serveStoredFile } from '../utils/serveFile.js';

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listClaims(req.query);
  sendSuccess(res, { message: 'Claims', data: items, meta: pagination });
});
export const stats = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Insurance stats', data: await service.insuranceStats() }));
export const get = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Claim', data: await service.getClaim(req.params.id) }));
export const create = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: 201, message: 'Claim created', data: await service.createClaim(req.body, req.user?._id) }));
export const update = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Claim updated', data: await service.updateClaim(req.params.id, req.body) }));
export const changeStatus = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: `Claim ${req.body.status}`, data: await service.changeStatus(req.params.id, req.body, req.user?._id) }));

// Claim documents
export const listClaimDocuments = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Documents', data: await service.listClaimDocuments(req.params.id) }));

export const uploadClaimDocument = asyncHandler(async (req, res) => {
  try {
    const doc = await service.createClaimDocument(req.params.id, req.file, req.body.category, req.user?._id);
    sendSuccess(res, { statusCode: 201, message: 'Document uploaded', data: doc });
  } catch (err) {
    // The bytes are already stored — don't leave them orphaned.
    await removeObject(req.file.storageKey);
    throw err;
  }
});

export const downloadClaimDocument = asyncHandler(async (req, res) => {
  const doc = await service.getClaimDocument(req.params.id, req.params.docId);
  await serveStoredFile(res, doc, { inline: req.query.inline === 'true' });
});

export const deleteClaimDocument = asyncHandler(async (req, res) => {
  await service.deleteClaimDocument(req.params.id, req.params.docId);
  sendSuccess(res, { message: 'Document deleted', data: null });
});
