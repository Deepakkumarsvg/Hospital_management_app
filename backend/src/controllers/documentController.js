import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { PatientDocument, DOCUMENT_CATEGORIES } from '../models/PatientDocument.js';
import { Patient } from '../models/Patient.js';
import { removeObject } from '../config/storage.js';
import { serveStoredFile } from '../utils/serveFile.js';

// GET /api/patients/:id/documents
export const listDocuments = asyncHandler(async (req, res) => {
  const docs = await PatientDocument.find({ patient: req.params.id })
    .populate('uploadedBy', 'name')
    .sort({ createdAt: -1 });
  sendSuccess(res, { message: 'Documents fetched', data: docs });
});

// POST /api/patients/:id/documents  (multipart: file, category)
export const uploadDocument = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.id).select('_id');
  if (!patient) {
    // The bytes are already stored by the time this runs — don't leave them
    // orphaned with no record pointing at them.
    await removeObject(req.file.storageKey);
    throw ApiError.notFound('Patient not found', 'PATIENT_NOT_FOUND');
  }

  const category = DOCUMENT_CATEGORIES.includes(req.body.category) ? req.body.category : 'OTHER';

  const doc = await PatientDocument.create({
    patient: patient._id,
    category,
    originalName: req.file.originalname,
    storageKey: req.file.storageKey,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploadedBy: req.user?._id,
  });

  sendSuccess(res, { statusCode: 201, message: 'Document uploaded', data: doc });
});

// GET /api/patients/:id/documents/:docId/download[?inline=true]
export const downloadDocument = asyncHandler(async (req, res) => {
  const doc = await PatientDocument.findOne({ _id: req.params.docId, patient: req.params.id });
  if (!doc) throw ApiError.notFound('Document not found', 'DOCUMENT_NOT_FOUND');

  // inline=true lets the frontend open PDFs/images in a new tab instead of
  // forcing a save-to-disk prompt.
  await serveStoredFile(res, doc, { inline: req.query.inline === 'true' });
});

// DELETE /api/patients/:id/documents/:docId
export const deleteDocument = asyncHandler(async (req, res) => {
  const doc = await PatientDocument.findOneAndDelete({ _id: req.params.docId, patient: req.params.id });
  if (!doc) throw ApiError.notFound('Document not found', 'DOCUMENT_NOT_FOUND');
  await removeObject(doc.storageKey);
  sendSuccess(res, { message: 'Document deleted', data: null });
});
