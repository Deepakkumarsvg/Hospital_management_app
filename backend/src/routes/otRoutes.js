import { Router } from 'express';
import * as c from '../controllers/otController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/roles.js';
import {
  createTheatreSchema, updateTheatreSchema,
  createSurgerySchema, updateSurgerySchema, surgeryStatusSchema, listSurgeryQuerySchema,
} from '../validators/otValidator.js';

const router = Router();
router.use(authenticate);

const CAN_VIEW = [ROLES.ADMIN, ROLES.OT_STAFF, ROLES.DOCTOR, ROLES.NURSE];
const CAN_MANAGE = [ROLES.ADMIN, ROLES.OT_STAFF, ROLES.DOCTOR];

router.get('/theatres', authorize(...CAN_VIEW), c.listTheatres);
router.get('/theatres/active', authorize(...CAN_VIEW), c.activeTheatres);
router.post('/theatres', authorize(ROLES.ADMIN), validate(createTheatreSchema), c.createTheatre);
router.put('/theatres/:id', authorize(ROLES.ADMIN), validate(updateTheatreSchema), c.updateTheatre);
router.delete('/theatres/:id', authorize(ROLES.ADMIN), c.deleteTheatre);

router.get('/surgeries', authorize(...CAN_VIEW), validate(listSurgeryQuerySchema, 'query'), c.listSurgeries);
router.get('/stats', authorize(...CAN_VIEW), c.stats);
router.get('/surgeries/:id', authorize(...CAN_VIEW), c.getSurgery);
router.post('/surgeries', authorize(...CAN_MANAGE), validate(createSurgerySchema), c.createSurgery);
router.put('/surgeries/:id', authorize(...CAN_MANAGE), validate(updateSurgerySchema), c.updateSurgery);
router.patch('/surgeries/:id/status', authorize(...CAN_MANAGE), validate(surgeryStatusSchema), c.changeStatus);

export default router;
