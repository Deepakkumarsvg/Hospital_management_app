import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as patientService from '../services/patientService.js';
import { audit } from '../utils/audit.js';
import { sendCsv, sendExcel } from '../utils/exporters.js';

// GET /api/patients
export const listPatients = asyncHandler(async (req, res) => {
  const { items, pagination } = await patientService.listPatients(req.query);
  sendSuccess(res, { message: 'Patients fetched', data: items, meta: pagination });
});

// GET /api/patients/stats
export const getStats = asyncHandler(async (_req, res) => {
  const stats = await patientService.patientStats();
  sendSuccess(res, { message: 'Patient stats', data: stats });
});

// GET /api/patients/export?format=csv|xlsx&search=&status=
export const exportPatients = asyncHandler(async (req, res) => {
  const rows = await patientService.patientRowsForExport(req.query);
  const name = `patients-${new Date().toISOString().slice(0, 10)}`;
  if (req.query.format === 'xlsx') return sendExcel(res, name, rows, 'Patients');
  return sendCsv(res, name, rows);
});

// GET /api/patients/:id
export const getPatient = asyncHandler(async (req, res) => {
  const patient = await patientService.getPatientById(req.params.id);
  sendSuccess(res, { message: 'Patient fetched', data: patient });
});

// POST /api/patients
export const createPatient = asyncHandler(async (req, res) => {
  const patient = await patientService.createPatient(req.body, req.user?._id);
  audit(req, { action: 'CREATE', module: 'Patient', recordId: patient.uhid, description: `Registered ${patient.fullName}` });
  sendSuccess(res, { statusCode: 201, message: 'Patient registered successfully', data: patient });
});

// PUT /api/patients/:id
export const updatePatient = asyncHandler(async (req, res) => {
  const patient = await patientService.updatePatient(req.params.id, req.body);
  audit(req, { action: 'UPDATE', module: 'Patient', recordId: patient.uhid, description: `Updated ${patient.fullName}` });
  sendSuccess(res, { message: 'Patient updated successfully', data: patient });
});

// DELETE /api/patients/:id
export const deletePatient = asyncHandler(async (req, res) => {
  await patientService.deletePatient(req.params.id);
  audit(req, { action: 'DELETE', module: 'Patient', recordId: req.params.id, description: 'Deleted a patient' });
  sendSuccess(res, { message: 'Patient deleted successfully', data: null });
});

// POST /api/patients/:id/merge  { duplicateId }
// :id is the survivor (kept); duplicateId is folded into it and removed.
export const mergePatient = asyncHandler(async (req, res) => {
  const { survivor, moved } = await patientService.mergePatients(req.params.id, req.body.duplicateId);
  audit(req, {
    action: 'UPDATE', module: 'Patient', recordId: survivor.uhid,
    description: `Merged duplicate patient ${req.body.duplicateId} into ${survivor.uhid}`,
    meta: moved,
  });
  sendSuccess(res, { message: 'Patients merged successfully', data: { survivor, moved } });
});
