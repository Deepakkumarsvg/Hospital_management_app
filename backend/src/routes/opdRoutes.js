import { Router } from 'express';
import * as controller from '../controllers/opdController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/roles.js';
import {
  createOpdVisitSchema,
  updateOpdVisitSchema,
  listOpdQuerySchema,
  exportOpdQuerySchema,
} from '../validators/opdValidator.js';

const router = Router();
router.use(authenticate);

const CAN_VIEW = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.NURSE, ROLES.RECEPTIONIST];
// Nurses record vitals; doctors run the consultation. Both can create/update.
const CAN_EDIT = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.NURSE];

router.post('/allergy-check', authorize(...CAN_EDIT), controller.allergyCheck);
router.get('/', authorize(...CAN_VIEW), validate(listOpdQuerySchema, 'query'), controller.list);
router.get('/stats', authorize(...CAN_VIEW), controller.stats);
router.get('/export', authorize(...CAN_VIEW), validate(exportOpdQuerySchema, 'query'), controller.exportVisits);
router.get('/:id', authorize(...CAN_VIEW), controller.get);
router.get('/:id/pdf', authorize(...CAN_VIEW), controller.prescriptionPdf);

router.post('/', authorize(...CAN_EDIT), validate(createOpdVisitSchema), controller.create);
router.put('/:id', authorize(...CAN_EDIT), validate(updateOpdVisitSchema), controller.update);
router.delete('/:id', authorize(ROLES.ADMIN), controller.remove);

export default router;
