import { Router } from 'express';
import * as c from '../controllers/hrController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/roles.js';
import {
  createEmployeeSchema, updateEmployeeSchema, listEmployeesQuerySchema, exportEmployeesQuerySchema,
  markAttendanceSchema, markAttendanceBulkSchema, listAttendanceQuerySchema, exportAttendanceQuerySchema, monthlyAttendanceQuerySchema,
  createLeaveSchema, leaveStatusSchema, listLeavesQuerySchema, exportLeavesQuerySchema,
  generatePayrollSchema, listPayslipsQuerySchema, exportPayslipsQuerySchema, adjustPayslipSchema,
} from '../validators/hrValidator.js';

const router = Router();
router.use(authenticate, authorize(ROLES.ADMIN, ROLES.HR));

router.get('/employees', validate(listEmployeesQuerySchema, 'query'), c.listEmployees);
router.get('/employees/active', c.activeEmployees);
router.get('/employees/export', validate(exportEmployeesQuerySchema, 'query'), c.exportEmployees);
router.get('/stats', c.stats);
router.get('/employees/:id', c.getEmployee);
router.post('/employees', validate(createEmployeeSchema), c.createEmployee);
router.put('/employees/:id', validate(updateEmployeeSchema), c.updateEmployee);
router.delete('/employees/:id', authorize(ROLES.ADMIN), c.deleteEmployee);

router.get('/attendance', validate(listAttendanceQuerySchema, 'query'), c.listAttendance);
router.get('/attendance/export', validate(exportAttendanceQuerySchema, 'query'), c.exportAttendance);
router.get('/attendance/summary', validate(monthlyAttendanceQuerySchema, 'query'), c.monthlyAttendanceSummary);
router.post('/attendance', validate(markAttendanceSchema), c.markAttendance);
router.post('/attendance/bulk', validate(markAttendanceBulkSchema), c.markAttendanceBulk);

router.get('/leaves', validate(listLeavesQuerySchema, 'query'), c.listLeaves);
router.get('/leaves/export', validate(exportLeavesQuerySchema, 'query'), c.exportLeaves);
router.post('/leaves', validate(createLeaveSchema), c.createLeave);
router.patch('/leaves/:id/status', validate(leaveStatusSchema), c.decideLeave);

router.get('/payslips', validate(listPayslipsQuerySchema, 'query'), c.listPayslips);
router.get('/payslips/export', validate(exportPayslipsQuerySchema, 'query'), c.exportPayslips);
router.get('/payroll/by-department', validate(monthlyAttendanceQuerySchema, 'query'), c.payrollByDepartment);
router.post('/payroll/generate', validate(generatePayrollSchema), c.generatePayroll);
router.get('/payslips/:id', c.getPayslip);
router.get('/payslips/:id/pdf', c.payslipPdf);
router.put('/payslips/:id/adjust', validate(adjustPayslipSchema), c.adjustPayslip);
router.patch('/payslips/:id/pay', c.markPayslipPaid);

export default router;
