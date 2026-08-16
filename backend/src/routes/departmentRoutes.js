import { Router } from 'express';
import * as controller from '../controllers/departmentController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/roles.js';
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  listDepartmentsQuerySchema,
  exportDepartmentsQuerySchema,
} from '../validators/departmentValidator.js';

const router = Router();
router.use(authenticate);

// Any authenticated user can read departments (needed for dropdowns everywhere).
router.get('/', validate(listDepartmentsQuerySchema, 'query'), controller.list);
router.get('/active', controller.active);
router.get('/export', authorize(ROLES.ADMIN), validate(exportDepartmentsQuerySchema, 'query'), controller.exportDepartments);
router.get('/:id', controller.get);

// Only ADMIN manages departments.
router.post('/', authorize(ROLES.ADMIN), validate(createDepartmentSchema), controller.create);
router.put('/:id', authorize(ROLES.ADMIN), validate(updateDepartmentSchema), controller.update);
router.delete('/:id', authorize(ROLES.ADMIN), controller.remove);

export default router;
