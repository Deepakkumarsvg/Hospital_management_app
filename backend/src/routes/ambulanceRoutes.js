import { Router } from 'express';
import * as c from '../controllers/ambulanceController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/roles.js';

const router = Router();
router.use(authenticate);

const CAN_VIEW = [ROLES.ADMIN, ROLES.RECEPTIONIST, ROLES.NURSE];
const CAN_MANAGE = [ROLES.ADMIN, ROLES.RECEPTIONIST];

router.get('/', authorize(...CAN_VIEW), c.listAmbulances);
router.get('/stats', authorize(...CAN_VIEW), c.stats);
router.get('/trips', authorize(...CAN_VIEW), c.listTrips);
router.post('/', authorize(ROLES.ADMIN), validate(c.ambulanceSchema), c.createAmbulance);
router.put('/:id', authorize(...CAN_MANAGE), validate(c.ambulanceSchema.partial()), c.updateAmbulance);
router.delete('/:id', authorize(ROLES.ADMIN), c.deleteAmbulance);
router.post('/trips', authorize(...CAN_MANAGE), validate(c.tripSchema), c.startTrip);
router.patch('/trips/:id/status', authorize(...CAN_MANAGE), validate(c.tripStatusSchema), c.endTrip);

export default router;
