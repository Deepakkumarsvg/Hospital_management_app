import { Router } from 'express';
import * as controller from '../controllers/ipdController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/roles.js';
import {
  admitSchema, updateAdmissionSchema, nursingNoteSchema,
  transferBedSchema, dischargeSchema, listIpdQuerySchema,
} from '../validators/ipdValidator.js';

const router = Router();
router.use(authenticate);

const CAN_VIEW = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.NURSE, ROLES.RECEPTIONIST];
const CAN_ADMIT = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST];
const CAN_NURSE = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.NURSE];

router.get('/', authorize(...CAN_VIEW), validate(listIpdQuerySchema, 'query'), controller.list);
router.get('/stats', authorize(...CAN_VIEW), controller.stats);
router.get('/:id', authorize(...CAN_VIEW), controller.get);
router.get('/:id/discharge-pdf', authorize(...CAN_VIEW), controller.dischargePdf);

router.post('/', authorize(...CAN_ADMIT), validate(admitSchema), controller.admit);
router.put('/:id', authorize(...CAN_ADMIT), validate(updateAdmissionSchema), controller.update);
router.post('/:id/notes', authorize(...CAN_NURSE), validate(nursingNoteSchema), controller.addNote);
router.patch('/:id/transfer', authorize(...CAN_ADMIT), validate(transferBedSchema), controller.transfer);
router.patch('/:id/discharge', authorize(...CAN_ADMIT), validate(dischargeSchema), controller.discharge);

export default router;
