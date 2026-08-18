import { Router } from 'express';
import * as patientController from '../controllers/patientController.js';
import * as documentController from '../controllers/documentController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { validate } from '../middleware/validate.js';
import { handlePatientUpload } from '../middleware/upload.js';
import {
  createPatientSchema,
  updatePatientSchema,
  listPatientsQuerySchema,
  exportPatientsQuerySchema,
  mergePatientSchema,
} from '../validators/patientValidator.js';

const router = Router();

// Everything requires authentication.
router.use(authenticate, auditTrail('Patient', { phi: true }));

// Clinical + front-desk roles may view patients.
// Only front desk / admin may create & edit.

router.get('/', requirePermission('patients:view'), validate(listPatientsQuerySchema, 'query'), patientController.listPatients);
router.get('/stats', requirePermission('patients:view'), patientController.getStats);
router.get('/export', requirePermission('patients:view'), validate(exportPatientsQuerySchema, 'query'), patientController.exportPatients);
router.get('/:id', requirePermission('patients:view'), patientController.getPatient);

router.post('/', requirePermission('patients:edit'), validate(createPatientSchema), patientController.createPatient);
router.put('/:id', requirePermission('patients:edit'), validate(updatePatientSchema), patientController.updatePatient);

// Deletion is restricted to ADMIN (SUPER_ADMIN bypasses via rbac).
router.delete('/:id', requirePermission('patients:delete'), patientController.deletePatient);

// Merging removes a whole patient profile, same trust level as delete.
router.post('/:id/merge', requirePermission('patients:delete'), validate(mergePatientSchema), patientController.mergePatient);

// --- Patient documents ---
router.get('/:id/documents', requirePermission('patients:view'), documentController.listDocuments);
router.get('/:id/documents/:docId/download', requirePermission('patients:view'), documentController.downloadDocument);
router.post('/:id/documents', requirePermission('patients:edit'), handlePatientUpload, documentController.uploadDocument);
router.delete('/:id/documents/:docId', requirePermission('patients:edit'), documentController.deleteDocument);

export default router;
