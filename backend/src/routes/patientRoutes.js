import { Router } from 'express';
import * as patientController from '../controllers/patientController.js';
import * as documentController from '../controllers/documentController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { handlePatientUpload } from '../middleware/upload.js';
import { ROLES } from '../config/roles.js';
import {
  createPatientSchema,
  updatePatientSchema,
  listPatientsQuerySchema,
} from '../validators/patientValidator.js';

const router = Router();

// Everything requires authentication.
router.use(authenticate);

// Clinical + front-desk roles may view patients.
const CAN_VIEW = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.NURSE, ROLES.RECEPTIONIST];
// Only front desk / admin may create & edit.
const CAN_EDIT = [ROLES.ADMIN, ROLES.RECEPTIONIST];

router.get('/', authorize(...CAN_VIEW), validate(listPatientsQuerySchema, 'query'), patientController.listPatients);
router.get('/stats', authorize(...CAN_VIEW), patientController.getStats);
router.get('/:id', authorize(...CAN_VIEW), patientController.getPatient);

router.post('/', authorize(...CAN_EDIT), validate(createPatientSchema), patientController.createPatient);
router.put('/:id', authorize(...CAN_EDIT), validate(updatePatientSchema), patientController.updatePatient);

// Deletion is restricted to ADMIN (SUPER_ADMIN bypasses via rbac).
router.delete('/:id', authorize(ROLES.ADMIN), patientController.deletePatient);

// --- Patient documents ---
router.get('/:id/documents', authorize(...CAN_VIEW), documentController.listDocuments);
router.get('/:id/documents/:docId/download', authorize(...CAN_VIEW), documentController.downloadDocument);
router.post('/:id/documents', authorize(...CAN_EDIT), handlePatientUpload, documentController.uploadDocument);
router.delete('/:id/documents/:docId', authorize(...CAN_EDIT), documentController.deleteDocument);

export default router;
