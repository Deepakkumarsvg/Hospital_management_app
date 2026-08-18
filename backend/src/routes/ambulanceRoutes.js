import { Router } from 'express';
import * as c from '../controllers/ambulanceController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(authenticate, auditTrail('Ambulance'));


router.get('/', requirePermission('ambulance:view'), c.listAmbulances);
router.get('/stats', requirePermission('ambulance:view'), c.stats);
router.get('/trips', requirePermission('ambulance:view'), validate(c.listTripsQuerySchema, 'query'), c.listTrips);
router.get('/trips/export', requirePermission('ambulance:view'), validate(c.exportTripsQuerySchema, 'query'), c.exportTrips);
router.get('/trips/:id/pdf', requirePermission('ambulance:view'), c.tripReceiptPdf);
router.post('/', requirePermission('ambulance:admin'), validate(c.ambulanceSchema), c.createAmbulance);
router.put('/:id', requirePermission('ambulance:manage'), validate(c.ambulanceSchema.partial()), c.updateAmbulance);
router.delete('/:id', requirePermission('ambulance:admin'), c.deleteAmbulance);
router.post('/trips', requirePermission('ambulance:manage'), validate(c.tripSchema), c.startTrip);
router.put('/trips/:id', requirePermission('ambulance:manage'), validate(c.updateTripSchema), c.updateTrip);
router.patch('/trips/:id/status', requirePermission('ambulance:manage'), validate(c.tripStatusSchema), c.endTrip);

export default router;
