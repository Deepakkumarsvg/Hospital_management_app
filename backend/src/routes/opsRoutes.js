import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize, requirePermission } from '../middleware/rbac.js';
import { ROLES } from '../config/roles.js';
import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import { channelsStatus } from '../services/channels.js';
import { gatewayStatus } from '../services/paymentGatewayService.js';
import { runAppointmentReminders } from '../services/scheduler.js';
import { handleWebhook } from '../services/paymentGatewayService.js';
import { listTenants, provisionTenant, setTenantStatus } from '../services/tenantService.js';
import { audit } from '../utils/audit.js';

const router = Router();

// Public payment webhook (Razorpay). Signature-verified inside the handler.
router.post('/payments/webhook', asyncHandler(async (req, res) => {
  const raw = JSON.stringify(req.body); // dev/mock; prod should use a raw-body parser
  const result = await handleWebhook(raw, req.headers['x-razorpay-signature']);
  sendSuccess(res, { message: 'Webhook processed', data: result });
}));

// Admin-only operations.
router.use(authenticate, requirePermission('ops:admin'));

router.get('/status', (_req, res) =>
  sendSuccess(res, { message: 'Integrations status', data: { channels: channelsStatus(), payments: gatewayStatus() } }));

router.post('/reminders/run', asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Reminders processed', data: await runAppointmentReminders() })));

// --- Tenant (hospital) management ---
// This spans every hospital on the platform, so it must be gated tighter
// than the router-wide ADMIN check above: a hospital's own ADMIN is scoped
// to their hospital's administration, not the whole platform's tenant
// registry — only SUPER_ADMIN may list, provision, or suspend other
// hospitals. (SUPER_ADMIN always passes authorize() regardless of the
// roles listed, so this narrows rather than only-adds.)
router.use('/tenants', authorize(ROLES.SUPER_ADMIN));

router.get('/tenants', asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Tenants', data: await listTenants() })));

router.post('/tenants', asyncHandler(async (req, res) => {
  const { slug, name, adminEmail, adminPassword } = req.body || {};
  const result = await provisionTenant({ slug, name, adminEmail, adminPassword });
  audit(req, { action: 'CREATE', module: 'Tenant', recordId: result.tenant.slug, description: `Provisioned hospital ${result.tenant.name}` });
  sendSuccess(res, { statusCode: 201, message: 'Hospital provisioned', data: result });
}));

router.patch('/tenants/:slug/status', asyncHandler(async (req, res) => {
  const tenant = await setTenantStatus(req.params.slug, req.body.status);
  audit(req, { action: 'UPDATE', module: 'Tenant', recordId: tenant.slug, description: `${tenant.name} marked ${tenant.status}` });
  sendSuccess(res, { message: 'Tenant updated', data: tenant });
}));

export default router;
