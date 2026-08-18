import { Router } from 'express';
import * as controller from '../controllers/doctorController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { validate } from '../middleware/validate.js';
import {
  createDoctorSchema,
  updateDoctorSchema,
  listDoctorsQuerySchema,
  exportDoctorsQuerySchema,
} from '../validators/doctorValidator.js';

const router = Router();
router.use(authenticate, auditTrail('Doctor'));

// Reading doctors is broadly allowed (needed for appointment booking).
router.get('/', validate(listDoctorsQuerySchema, 'query'), controller.list);
router.get('/active', controller.active);
router.get('/stats', controller.stats);
router.get('/export', requirePermission('doctors:manage'), validate(exportDoctorsQuerySchema, 'query'), controller.exportDoctors);
router.get('/me', controller.me); // must precede /:id
router.get('/:id', controller.get);

// Only ADMIN manages doctor records.
router.post('/', requirePermission('doctors:manage'), validate(createDoctorSchema), controller.create);
router.put('/:id', requirePermission('doctors:manage'), validate(updateDoctorSchema), controller.update);
router.delete('/:id', requirePermission('doctors:manage'), controller.remove);

export default router;
