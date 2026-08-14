import { Router } from 'express';
import * as c from '../controllers/hrController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/roles.js';
import {
  createEmployeeSchema, updateEmployeeSchema, markAttendanceSchema, createLeaveSchema, leaveStatusSchema,
} from '../validators/hrValidator.js';

const router = Router();
router.use(authenticate, authorize(ROLES.ADMIN, ROLES.HR));

router.get('/employees', c.listEmployees);
router.get('/employees/active', c.activeEmployees);
router.get('/stats', c.stats);
router.post('/employees', validate(createEmployeeSchema), c.createEmployee);
router.put('/employees/:id', validate(updateEmployeeSchema), c.updateEmployee);
router.delete('/employees/:id', authorize(ROLES.ADMIN), c.deleteEmployee);

router.get('/attendance', c.listAttendance);
router.post('/attendance', validate(markAttendanceSchema), c.markAttendance);

router.get('/leaves', c.listLeaves);
router.post('/leaves', validate(createLeaveSchema), c.createLeave);
router.patch('/leaves/:id/status', validate(leaveStatusSchema), c.decideLeave);

export default router;
