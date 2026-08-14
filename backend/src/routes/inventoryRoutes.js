import { Router } from 'express';
import * as c from '../controllers/inventoryController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/roles.js';
import {
  createItemSchema, updateItemSchema, adjustStockSchema,
  createVendorSchema, updateVendorSchema, createPoSchema, listItemsQuerySchema,
} from '../validators/inventoryValidator.js';

const router = Router();
router.use(authenticate);

const CAN_VIEW = [ROLES.ADMIN, ROLES.STORE_MANAGER];
const CAN_MANAGE = [ROLES.ADMIN, ROLES.STORE_MANAGER];

// --- Items ---
router.get('/items', authorize(...CAN_VIEW), validate(listItemsQuerySchema, 'query'), c.listItems);
router.get('/items/active', authorize(...CAN_VIEW), c.activeItems);
router.get('/stats', authorize(...CAN_VIEW), c.stats);
router.get('/items/:id/transactions', authorize(...CAN_VIEW), c.itemTransactions);
router.post('/items', authorize(...CAN_MANAGE), validate(createItemSchema), c.createItem);
router.put('/items/:id', authorize(...CAN_MANAGE), validate(updateItemSchema), c.updateItem);
router.delete('/items/:id', authorize(ROLES.ADMIN), c.deleteItem);
router.post('/items/:id/adjust', authorize(...CAN_MANAGE), validate(adjustStockSchema), c.adjustStock);

// --- Vendors ---
router.get('/vendors', authorize(...CAN_VIEW), c.listVendors);
router.get('/vendors/active', authorize(...CAN_VIEW), c.activeVendors);
router.post('/vendors', authorize(...CAN_MANAGE), validate(createVendorSchema), c.createVendor);
router.put('/vendors/:id', authorize(...CAN_MANAGE), validate(updateVendorSchema), c.updateVendor);
router.delete('/vendors/:id', authorize(ROLES.ADMIN), c.deleteVendor);

// --- Purchase orders ---
router.get('/purchase-orders', authorize(...CAN_VIEW), c.listPurchaseOrders);
router.get('/purchase-orders/:id', authorize(...CAN_VIEW), c.getPurchaseOrder);
router.post('/purchase-orders', authorize(...CAN_MANAGE), validate(createPoSchema), c.createPurchaseOrder);
router.patch('/purchase-orders/:id/receive', authorize(...CAN_MANAGE), c.receivePurchaseOrder);
router.patch('/purchase-orders/:id/cancel', authorize(...CAN_MANAGE), c.cancelPurchaseOrder);

export default router;
