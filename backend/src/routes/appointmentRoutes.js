import { Router } from 'express';
import * as controller from '../controllers/appointmentController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/roles.js';
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  changeStatusSchema,
  listAppointmentsQuerySchema,
} from '../validators/appointmentValidator.js';

const router = Router();
router.use(authenticate);

const CAN_VIEW = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.NURSE, ROLES.RECEPTIONIST];
const CAN_BOOK = [ROLES.ADMIN, ROLES.RECEPTIONIST];
// Doctors/nurses can move a patient through the visit flow (check-in → complete).
const CAN_UPDATE_STATUS = [ROLES.ADMIN, ROLES.RECEPTIONIST, ROLES.DOCTOR, ROLES.NURSE];

router.get('/', authorize(...CAN_VIEW), validate(listAppointmentsQuerySchema, 'query'), controller.list);
router.get('/stats', authorize(...CAN_VIEW), controller.stats);
router.get('/:id', authorize(...CAN_VIEW), controller.get);

router.post('/', authorize(...CAN_BOOK), validate(createAppointmentSchema), controller.create);
router.put('/:id', authorize(...CAN_BOOK), validate(updateAppointmentSchema), controller.update);
router.patch('/:id/status', authorize(...CAN_UPDATE_STATUS), validate(changeStatusSchema), controller.changeStatus);
router.delete('/:id', authorize(ROLES.ADMIN), controller.remove);

export default router;
