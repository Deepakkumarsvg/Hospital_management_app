import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { ROLES } from '../config/roles.js';
import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import { channelsStatus } from '../services/channels.js';
import { gatewayStatus } from '../services/paymentGatewayService.js';
import { runAppointmentReminders } from '../services/scheduler.js';
import { handleWebhook } from '../services/paymentGatewayService.js';
import { listTenants, provisionTenant, setTenantStatus } from '../services/tenantService.js';

const router = Router();

// Public payment webhook (Razorpay). Signature-verified inside the handler.
router.post('/payments/webhook', asyncHandler(async (req, res) => {
  const raw = JSON.stringify(req.body); // dev/mock; prod should use a raw-body parser
  const result = await handleWebhook(raw, req.headers['x-razorpay-signature']);
  sendSuccess(res, { message: 'Webhook processed', data: result });
}));

// Admin-only operations.
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/status', (_req, res) =>
  sendSuccess(res, { message: 'Integrations status', data: { channels: channelsStatus(), payments: gatewayStatus() } }));

router.post('/reminders/run', asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Reminders processed', data: await runAppointmentReminders() })));

// --- Tenant (hospital) management ---
// NOTE: In production this belongs on a separate platform-admin plane; here it
// is gated to admins for convenience.
router.get('/tenants', asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Tenants', data: await listTenants() })));

router.post('/tenants', asyncHandler(async (req, res) => {
  const { slug, name, adminEmail, adminPassword } = req.body || {};
  const result = await provisionTenant({ slug, name, adminEmail, adminPassword });
  sendSuccess(res, { statusCode: 201, message: 'Hospital provisioned', data: result });
}));

router.patch('/tenants/:slug/status', asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Tenant updated', data: await setTenantStatus(req.params.slug, req.body.status) })));

export default router;
