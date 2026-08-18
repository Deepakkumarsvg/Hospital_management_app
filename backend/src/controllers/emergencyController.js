import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/emergencyService.js';
import { TRIAGE_LEVELS } from '../models/EmergencyVisit.js';
import { audit } from '../utils/audit.js';
import { sendCsv, sendExcel } from '../utils/exporters.js';

// The triage scale itself, so the client renders the same levels, colours and
// targets the server measures against rather than a copy that can drift.
export const triageScale = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Triage scale', data: TRIAGE_LEVELS }));

export const queue = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Emergency queue', data: await service.queue() }));

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listVisits(req.query);
  sendSuccess(res, { message: 'Emergency visits', data: items, meta: pagination });
});

export const get = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Emergency visit', data: await service.getVisit(req.params.id) }));

export const stats = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Emergency stats', data: await service.erStats(req.query) }));

export const register = asyncHandler(async (req, res) => {
  const visit = await service.registerArrival(req.body, req.user?._id);
  audit(req, {
    action: 'CREATE', module: 'EmergencyVisit', recordId: visit.erNo,
    description: `${visit.erNo} · ${visit.displayName} · ${visit.chiefComplaint}`,
  });
  sendSuccess(res, { statusCode: 201, message: 'Arrival registered', data: visit });
});

export const triage = asyncHandler(async (req, res) => {
  const visit = await service.triage(req.params.id, req.body, req.user?._id);
  audit(req, {
    action: 'UPDATE', module: 'EmergencyVisit', recordId: visit.erNo,
    description: `${visit.erNo} triaged to level ${req.body.level}${req.body.reason ? ` — ${req.body.reason}` : ''}`,
  });
  sendSuccess(res, { message: 'Triage recorded', data: visit });
});

export const startTreatment = asyncHandler(async (req, res) => {
  const visit = await service.startTreatment(req.params.id, req.body.doctor);
  audit(req, {
    action: 'UPDATE', module: 'EmergencyVisit', recordId: visit.erNo,
    // The door-to-doctor time is the department's headline measure, so the
    // moment it is fixed is worth having on the trail.
    description: `${visit.erNo} seen after ${visit.doorToDoctorMinutes} min`,
  });
  sendSuccess(res, { message: 'Treatment started', data: visit });
});

export const update = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Visit updated', data: await service.updateVisit(req.params.id, req.body) }));

export const observe = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Moved to observation', data: await service.observe(req.params.id) }));

export const identify = asyncHandler(async (req, res) => {
  const visit = await service.identifyPatient(req.params.id, req.body.patient);
  audit(req, {
    action: 'UPDATE', module: 'EmergencyVisit', recordId: visit.erNo,
    description: `${visit.erNo} identified as ${visit.patient?.uhid || ''}`,
  });
  sendSuccess(res, { message: 'Patient identified', data: visit });
});

export const flagMLC = asyncHandler(async (req, res) => {
  const visit = await service.flagMLC(req.params.id, req.body, req.user?._id);
  audit(req, {
    action: 'UPDATE', module: 'EmergencyVisit', recordId: visit.erNo,
    description: `${visit.erNo} flagged medico-legal (${visit.mlc?.mlcNo}, ${req.body.nature})`,
  });
  sendSuccess(res, { message: 'Marked as medico-legal', data: visit });
});

export const dispose = asyncHandler(async (req, res) => {
  const visit = await service.dispose(req.params.id, req.body, req.user?._id);
  audit(req, {
    action: 'UPDATE', module: 'EmergencyVisit', recordId: visit.erNo,
    description: `${visit.erNo} closed as ${req.body.disposition} after ${visit.waitingMinutes} min`,
  });
  sendSuccess(res, { message: 'Visit closed', data: visit });
});

// The statutory register, as a file the hospital can hand over.
export const exportMlcRegister = asyncHandler(async (req, res) => {
  const rows = await service.mlcRegisterRows(req.query);
  const name = `mlc-register-${new Date().toISOString().slice(0, 10)}`;
  if (req.query.format === 'xlsx') return sendExcel(res, name, rows, 'MLC Register');
  return sendCsv(res, name, rows);
});
