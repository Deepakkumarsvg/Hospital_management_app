import { Router } from 'express';
import * as controller from '../controllers/departmentController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { validate } from '../middleware/validate.js';
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  listDepartmentsQuerySchema,
  exportDepartmentsQuerySchema,
} from '../validators/departmentValidator.js';

const router = Router();
router.use(authenticate, auditTrail('Department'));

// Any authenticated user can read departments (needed for dropdowns everywhere).
router.get('/', validate(listDepartmentsQuerySchema, 'query'), controller.list);
router.get('/active', controller.active);
router.get('/export', requirePermission('departments:manage'), validate(exportDepartmentsQuerySchema, 'query'), controller.exportDepartments);
router.get('/:id', controller.get);

// Only ADMIN manages departments.
router.post('/', requirePermission('departments:manage'), validate(createDepartmentSchema), controller.create);
router.put('/:id', requirePermission('departments:manage'), validate(updateDepartmentSchema), controller.update);
router.delete('/:id', requirePermission('departments:manage'), controller.remove);

export default router;
