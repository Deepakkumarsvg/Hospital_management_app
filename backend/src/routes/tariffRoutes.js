import { Router } from 'express';
import * as c from '../controllers/tariffController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { validate } from '../middleware/validate.js';
import {
  createPlanSchema, updatePlanSchema, setRateSchema, setRatesBulkSchema, listPlansQuerySchema,
} from '../validators/tariffValidator.js';

const router = Router();
router.use(authenticate, auditTrail('TariffPlan'));

router.get('/', requirePermission('tariffs:view'), validate(listPlansQuerySchema, 'query'), c.list);
router.get('/active', requirePermission('tariffs:view'), c.active);
router.get('/:id', requirePermission('tariffs:view'), c.get);
router.get('/:id/rates', requirePermission('tariffs:view'), c.rates);

router.post('/', requirePermission('tariffs:manage'), validate(createPlanSchema), c.create);
router.put('/:id', requirePermission('tariffs:manage'), validate(updatePlanSchema), c.update);
router.patch('/:id/default', requirePermission('tariffs:manage'), c.makeDefault);
router.delete('/:id', requirePermission('tariffs:manage'), c.remove);

router.put('/:id/rates', requirePermission('tariffs:manage'), validate(setRateSchema), c.setRate);
router.post('/:id/rates/bulk', requirePermission('tariffs:manage'), validate(setRatesBulkSchema), c.setRatesBulk);

export default router;
