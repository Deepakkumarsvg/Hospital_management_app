import { Router } from 'express';
import * as c from '../controllers/settingController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/roles.js';
import { updateSettingSchema } from '../validators/settingValidator.js';

const router = Router();
router.use(authenticate);

// Any authenticated user can read settings (needed for branding on screens).
router.get('/', c.get);
// Only admins can change hospital-wide configuration.
router.put('/', authorize(ROLES.ADMIN), validate(updateSettingSchema), c.update);

export default router;
