import { Router } from 'express';
import * as c from '../controllers/clinicalController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { validate } from '../middleware/validate.js';
import {
  recordVitalsSchema, addNoteSchema, amendNoteSchema, prescribeSchema,
  stopOrderSchema, administerSchema, marQuerySchema, notesQuerySchema,
} from '../validators/clinicalValidator.js';

const router = Router();
router.use(authenticate, auditTrail('Clinical', { phi: true }));

router.get('/options', requirePermission('clinical:view'), c.options);

// --- Observations. Recording them is nursing work; reading them is for anyone
// clinical.
router.get('/vitals/:encounterId', requirePermission('clinical:view'), c.listVitals);
router.get('/vitals/:encounterId/trend', requirePermission('clinical:view'), c.vitalsTrend);
router.post('/vitals', requirePermission('clinical:vitals'), validate(recordVitalsSchema), c.recordVitals);

// --- Notes
router.get('/notes/:encounterId', requirePermission('clinical:view'), validate(notesQuerySchema, 'query'), c.listNotes);
router.post('/notes', requirePermission('clinical:note'), validate(addNoteSchema), c.addNote);
router.patch('/notes/:id/sign', requirePermission('clinical:note'), c.signNote);
router.patch('/notes/:id', requirePermission('clinical:note'), validate(amendNoteSchema), c.amendNote);

// --- Prescribing is a doctor's act and nobody else's.
router.post('/orders', requirePermission('clinical:prescribe'), validate(prescribeSchema), c.prescribe);
router.patch('/orders/:id/stop', requirePermission('clinical:prescribe'), validate(stopOrderSchema), c.stopOrder);
router.patch('/orders/:id/hold', requirePermission('clinical:prescribe'), c.holdOrder);

// --- Administering is a nurse's act, and deliberately a different permission
// from prescribing: the entire safety value of a drug chart is that the person
// who writes the order and the person who gives the drug are two people.
router.get('/mar/:encounterId', requirePermission('clinical:view'), validate(marQuerySchema, 'query'), c.mar);
router.get('/mar/:encounterId/missed', requirePermission('clinical:view'), c.missedDoses);
router.post('/orders/:id/administer', requirePermission('clinical:administer'), validate(administerSchema), c.administer);

export default router;
