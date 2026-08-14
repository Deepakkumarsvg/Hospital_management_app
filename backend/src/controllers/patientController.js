import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as patientService from '../services/patientService.js';
import { audit } from '../utils/audit.js';

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
