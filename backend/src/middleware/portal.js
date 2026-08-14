import { ApiError } from '../utils/ApiError.js';
import { ROLES } from '../config/roles.js';

// Ensures the caller is a PATIENT-role account linked to a Patient profile,
// and exposes that profile id as req.patientId for scoping every portal query.
export function requirePatient(req, _res, next) {
  if (req.user?.role !== ROLES.PATIENT || !req.user?.patient) {
    return next(ApiError.forbidden('Patient portal access only', 'NOT_A_PATIENT'));
  }
  req.patientId = req.user.patient;
  next();
}
