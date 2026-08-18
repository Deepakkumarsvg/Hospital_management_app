import { Router } from 'express';
import * as c from '../controllers/insuranceController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { validate } from '../middleware/validate.js';
import { handleClaimUpload } from '../middleware/upload.js';
import {
  createClaimSchema, updateClaimSchema, claimStatusSchema, listClaimsQuerySchema,
} from '../validators/insuranceValidator.js';

const router = Router();
router.use(authenticate, auditTrail('InsuranceClaim', { phi: true }));


router.get('/claims', requirePermission('insurance:view'), validate(listClaimsQuerySchema, 'query'), c.list);
router.get('/stats', requirePermission('insurance:view'), c.stats);
router.get('/claims/:id', requirePermission('insurance:view'), c.get);
router.post('/claims', requirePermission('insurance:manage'), validate(createClaimSchema), c.create);
router.put('/claims/:id', requirePermission('insurance:manage'), validate(updateClaimSchema), c.update);
router.patch('/claims/:id/status', requirePermission('insurance:manage'), validate(claimStatusSchema), c.changeStatus);

router.get('/claims/:id/documents', requirePermission('insurance:view'), c.listClaimDocuments);
router.post('/claims/:id/documents', requirePermission('insurance:manage'), handleClaimUpload, c.uploadClaimDocument);
router.get('/claims/:id/documents/:docId/download', requirePermission('insurance:view'), c.downloadClaimDocument);
router.delete('/claims/:id/documents/:docId', requirePermission('insurance:manage'), c.deleteClaimDocument);

export default router;
