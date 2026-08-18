import { Router } from 'express';
import * as c from '../controllers/inventoryController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { validate } from '../middleware/validate.js';
import { handleCsvUpload } from '../middleware/upload.js';
import {
  createItemSchema, updateItemSchema, adjustStockSchema,
  createVendorSchema, updateVendorSchema, createPoSchema, updatePoSchema, receivePoSchema,
  listItemsQuerySchema, exportItemsQuerySchema, exportVendorsQuerySchema,
  listPoQuerySchema, exportPoQuerySchema,
} from '../validators/inventoryValidator.js';

const router = Router();
router.use(authenticate, auditTrail('Inventory'));


// --- Items ---
router.get('/items', requirePermission('inventory:view'), validate(listItemsQuerySchema, 'query'), c.listItems);
router.get('/items/active', requirePermission('inventory:view'), c.activeItems);
router.get('/items/export', requirePermission('inventory:view'), validate(exportItemsQuerySchema, 'query'), c.exportItems);
router.post('/items/import', requirePermission('inventory:manage'), handleCsvUpload, c.importItems);
router.get('/stats', requirePermission('inventory:view'), c.stats);
router.get('/items/:id/transactions', requirePermission('inventory:view'), c.itemTransactions);
router.get('/items/:id/batches', requirePermission('inventory:view'), c.itemBatches);
router.get('/items/:id/last-price', requirePermission('inventory:view'), c.itemLastPrice);
router.post('/items', requirePermission('inventory:manage'), validate(createItemSchema), c.createItem);
router.put('/items/:id', requirePermission('inventory:manage'), validate(updateItemSchema), c.updateItem);
router.delete('/items/:id', requirePermission('inventory:delete'), c.deleteItem);
router.post('/items/:id/adjust', requirePermission('inventory:manage'), validate(adjustStockSchema), c.adjustStock);

// --- Vendors ---
router.get('/vendors', requirePermission('inventory:view'), c.listVendors);
router.get('/vendors/active', requirePermission('inventory:view'), c.activeVendors);
router.get('/vendors/export', requirePermission('inventory:view'), validate(exportVendorsQuerySchema, 'query'), c.exportVendors);
router.post('/vendors', requirePermission('inventory:manage'), validate(createVendorSchema), c.createVendor);
router.put('/vendors/:id', requirePermission('inventory:manage'), validate(updateVendorSchema), c.updateVendor);
router.get('/vendors/:id', requirePermission('inventory:view'), c.getVendor);
router.delete('/vendors/:id', requirePermission('inventory:delete'), c.deleteVendor);

// --- Purchase orders ---
router.get('/purchase-orders', requirePermission('inventory:view'), validate(listPoQuerySchema, 'query'), c.listPurchaseOrders);
router.get('/purchase-orders/export', requirePermission('inventory:view'), validate(exportPoQuerySchema, 'query'), c.exportPurchaseOrders);
router.get('/purchase-orders/:id', requirePermission('inventory:view'), c.getPurchaseOrder);
router.get('/purchase-orders/:id/pdf', requirePermission('inventory:view'), c.purchaseOrderPdf);
router.post('/purchase-orders', requirePermission('inventory:manage'), validate(createPoSchema), c.createPurchaseOrder);
router.put('/purchase-orders/:id', requirePermission('inventory:manage'), validate(updatePoSchema), c.updatePurchaseOrder);
router.patch('/purchase-orders/:id/place', requirePermission('inventory:manage'), c.placeOrder);
router.patch('/purchase-orders/:id/receive', requirePermission('inventory:manage'), validate(receivePoSchema), c.receivePurchaseOrder);
router.patch('/purchase-orders/:id/cancel', requirePermission('inventory:manage'), c.cancelPurchaseOrder);

export default router;
