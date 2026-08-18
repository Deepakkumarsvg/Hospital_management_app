import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/clinicalService.js';
import { MED_FREQUENCIES, NOTE_TYPES, MED_ROUTES } from '../models/ClinicalRecord.js';
import { audit } from '../utils/audit.js';

// The vocabularies the client builds its forms from, served rather than
// duplicated — a frequency the server cannot turn into due-times must not be
// offerable on a prescribing form.
export const options = asyncHandler(async (_req, res) => sendSuccess(res, {
  message: 'Clinical options',
  data: {
    frequencies: Object.entries(MED_FREQUENCIES).map(([code, v]) => ({ code, ...v })),
    routes: MED_ROUTES,
    noteTypes: NOTE_TYPES,
  },
}));

// --- Observations ---
export const recordVitals = asyncHandler(async (req, res) => {
  const record = await service.recordVitals(req.body, req.user?._id);
  audit(req, {
    action: 'CREATE', module: 'Vitals', recordId: req.body.encounter,
    description: `Observations recorded${record.news2 !== null ? ` · NEWS2 ${record.news2}` : ''}`,
  });
  sendSuccess(res, { statusCode: 201, message: 'Observations recorded', data: record });
});

export const listVitals = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Observations', data: await service.vitalsFor(req.params.encounterId) }));

export const vitalsTrend = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Observation trend', data: await service.vitalsTrend(req.params.encounterId) }));

// --- Notes ---
export const addNote = asyncHandler(async (req, res) => {
  const note = await service.addNote(req.body, req.user);
  audit(req, {
    action: 'CREATE', module: 'ClinicalNote', recordId: req.body.encounter,
    description: `${req.body.noteType} note added`,
  });
  sendSuccess(res, { statusCode: 201, message: 'Note added', data: note });
});

export const listNotes = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Notes', data: await service.notesFor(req.params.encounterId, req.query) }));

export const signNote = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Note signed', data: await service.signNote(req.params.id, req.user?._id) }));

export const amendNote = asyncHandler(async (req, res) => {
  const note = await service.amendNote(req.params.id, req.body, req.user?._id);
  audit(req, {
    action: 'UPDATE', module: 'ClinicalNote', recordId: req.params.id,
    // Whether this was an edit or an addendum is exactly what a reviewer cares
    // about, so it is stated rather than left to be inferred.
    description: note.isSigned ? 'Addendum added to a signed note' : 'Draft note edited',
  });
  sendSuccess(res, { message: 'Note updated', data: note });
});

// --- Medication orders ---
export const prescribe = asyncHandler(async (req, res) => {
  const order = await service.prescribe(req.body, req.user?._id);
  audit(req, {
    action: 'CREATE', module: 'MedicationOrder', recordId: order._id,
    description: `${order.medicineName} ${order.dose} ${order.frequency} ${order.route}`
      + (order.allergyWarnings.length ? ` — allergy override: ${req.body.overrideReason}` : ''),
  });
  sendSuccess(res, { statusCode: 201, message: 'Prescribed', data: order });
});

export const stopOrder = asyncHandler(async (req, res) => {
  const order = await service.stopOrder(req.params.id, req.body, req.user?._id);
  audit(req, {
    action: 'UPDATE', module: 'MedicationOrder', recordId: order._id,
    description: `${order.medicineName} stopped${order.stopReason ? ` — ${order.stopReason}` : ''}`,
  });
  sendSuccess(res, { message: 'Order stopped', data: order });
});

export const holdOrder = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    message: 'Order updated',
    data: await service.holdOrder(req.params.id, req.body.hold !== false),
  }));

// --- Medication administration record ---
export const mar = asyncHandler(async (req, res) => {
  const day = req.query.day ? new Date(req.query.day) : new Date();
  sendSuccess(res, { message: 'Medication chart', data: await service.marFor(req.params.encounterId, day) });
});

export const administer = asyncHandler(async (req, res) => {
  const record = await service.administer(req.params.id, req.body, req.user?._id);
  audit(req, {
    action: 'CREATE', module: 'MedicationAdministration', recordId: req.params.id,
    description: `Dose ${req.body.status}${req.body.reason ? ` — ${req.body.reason}` : ''}`,
  });
  sendSuccess(res, { statusCode: 201, message: 'Recorded', data: record });
});

export const missedDoses = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Missed doses', data: await service.missedDoses(req.params.encounterId, req.query) }));
