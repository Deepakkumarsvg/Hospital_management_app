import { Router } from 'express';
import * as controller from '../controllers/appointmentController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { validate } from '../middleware/validate.js';
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  changeStatusSchema,
  listAppointmentsQuerySchema,
  exportAppointmentsQuerySchema,
} from '../validators/appointmentValidator.js';

const router = Router();
router.use(authenticate, auditTrail('Appointment', { phi: true }));

// Doctors/nurses can move a patient through the visit flow (check-in → complete).

router.get('/', requirePermission('appointments:view'), validate(listAppointmentsQuerySchema, 'query'), controller.list);
router.get('/stats', requirePermission('appointments:view'), controller.stats);
router.get('/export', requirePermission('appointments:view'), validate(exportAppointmentsQuerySchema, 'query'), controller.exportAppointments);
router.get('/:id', requirePermission('appointments:view'), controller.get);

router.post('/', requirePermission('appointments:book'), validate(createAppointmentSchema), controller.create);
router.put('/:id', requirePermission('appointments:book'), validate(updateAppointmentSchema), controller.update);
router.patch('/:id/status', requirePermission('appointments:status'), validate(changeStatusSchema), controller.changeStatus);
router.delete('/:id', requirePermission('appointments:delete'), controller.remove);

export default router;
