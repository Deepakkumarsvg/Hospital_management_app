import { Router } from 'express';
import * as userController from '../controllers/userController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/roles.js';
import {
  createUserSchema,
  updateUserSchema,
  listUsersQuerySchema,
} from '../validators/userValidator.js';

const router = Router();

// All user-management routes require an authenticated admin.
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/', validate(listUsersQuerySchema, 'query'), userController.listUsers);
router.get('/roles', userController.listRoles);
router.get('/stats', userController.stats);
router.get('/:id', userController.getUser);
router.post('/', validate(createUserSchema), userController.createUser);
router.put('/:id', validate(updateUserSchema), userController.updateUser);
router.delete('/:id', userController.deleteUser);

export default router;
