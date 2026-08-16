import { Router } from 'express';
import * as controller from '../controllers/doctorController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/roles.js';
import {
  createDoctorSchema,
  updateDoctorSchema,
  listDoctorsQuerySchema,
  exportDoctorsQuerySchema,
} from '../validators/doctorValidator.js';

const router = Router();
router.use(authenticate);

// Reading doctors is broadly allowed (needed for appointment booking).
router.get('/', validate(listDoctorsQuerySchema, 'query'), controller.list);
router.get('/active', controller.active);
router.get('/stats', controller.stats);
router.get('/export', authorize(ROLES.ADMIN), validate(exportDoctorsQuerySchema, 'query'), controller.exportDoctors);
router.get('/me', controller.me); // must precede /:id
router.get('/:id', controller.get);

// Only ADMIN manages doctor records.
router.post('/', authorize(ROLES.ADMIN), validate(createDoctorSchema), controller.create);
router.put('/:id', authorize(ROLES.ADMIN), validate(updateDoctorSchema), controller.update);
router.delete('/:id', authorize(ROLES.ADMIN), controller.remove);

export default router;
