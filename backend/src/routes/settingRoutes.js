import { Router } from 'express';
import * as c from '../controllers/settingController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { handleLogoUpload } from '../middleware/upload.js';
import { ROLES } from '../config/roles.js';
import { updateSettingSchema } from '../validators/settingValidator.js';

const router = Router();

// Public brand info/asset — used unauthenticated on the login page too, so
// these must not require a token (tenant is still resolved from X-Tenant by
// the global middleware ahead of this router).
router.get('/public', c.getPublic);
router.get('/logo', c.getLogo);

router.use(authenticate);

// Any authenticated user can read settings (needed for branding on screens).
router.get('/', c.get);
// Only admins can change hospital-wide configuration.
router.put('/', authorize(ROLES.ADMIN), validate(updateSettingSchema), c.update);
router.post('/logo', authorize(ROLES.ADMIN), handleLogoUpload, c.uploadLogo);
router.delete('/logo', authorize(ROLES.ADMIN), c.removeLogo);

export default router;
