import { Router } from 'express';
import * as c from '../controllers/insuranceController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { handleClaimUpload } from '../middleware/upload.js';
import { ROLES } from '../config/roles.js';
import {
  createClaimSchema, updateClaimSchema, claimStatusSchema, listClaimsQuerySchema,
} from '../validators/insuranceValidator.js';

const router = Router();
router.use(authenticate);

const CAN = [ROLES.ADMIN, ROLES.ACCOUNTANT];

router.get('/claims', authorize(...CAN), validate(listClaimsQuerySchema, 'query'), c.list);
router.get('/stats', authorize(...CAN), c.stats);
router.get('/claims/:id', authorize(...CAN), c.get);
router.post('/claims', authorize(...CAN), validate(createClaimSchema), c.create);
router.put('/claims/:id', authorize(...CAN), validate(updateClaimSchema), c.update);
router.patch('/claims/:id/status', authorize(...CAN), validate(claimStatusSchema), c.changeStatus);

router.get('/claims/:id/documents', authorize(...CAN), c.listClaimDocuments);
router.post('/claims/:id/documents', authorize(...CAN), handleClaimUpload, c.uploadClaimDocument);
router.get('/claims/:id/documents/:docId/download', authorize(...CAN), c.downloadClaimDocument);
router.delete('/claims/:id/documents/:docId', authorize(...CAN), c.deleteClaimDocument);

export default router;
