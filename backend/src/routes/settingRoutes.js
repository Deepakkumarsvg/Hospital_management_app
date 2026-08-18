import { Router } from 'express';
import * as c from '../controllers/settingController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { validate } from '../middleware/validate.js';
import { handleLogoUpload } from '../middleware/upload.js';
import { updateSettingSchema } from '../validators/settingValidator.js';

const router = Router();

// Public brand info/asset — used unauthenticated on the login page too, so
// these must not require a token (tenant is still resolved from X-Tenant by
// the global middleware ahead of this router).
router.get('/public', c.getPublic);
router.get('/logo', c.getLogo);

router.use(authenticate, auditTrail('Setting'));

// Any authenticated user can read settings (needed for branding on screens).
router.get('/', c.get);
// Only admins can change hospital-wide configuration.
router.put('/', requirePermission('settings:manage'), validate(updateSettingSchema), c.update);
router.post('/logo', requirePermission('settings:manage'), handleLogoUpload, c.uploadLogo);
router.delete('/logo', requirePermission('settings:manage'), c.removeLogo);

export default router;
