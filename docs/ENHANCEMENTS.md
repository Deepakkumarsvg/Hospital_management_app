# HMS — Enhancement Tracker

Senior-review se nikli list. Priority order me, ek-ek karke fix ho rahi hai.
Status: ⬜ pending · 🔨 in progress · ✅ done

**Progress: 13 done · test suite 26 → 98 tests, all passing.**

The test suite now boots its own in-memory MongoDB (single-node replica set),
so `npm test` needs nothing installed — see `tests/globalSetup.js`.

---

## 🔴 P0 — Data Integrity

| # | Item | Files | Status |
|---|------|-------|--------|
| 1 | Atomic bed allocation (admit / transfer / discharge race) | `services/ipdService.js` | ✅ |
| 2 | Atomic stock decrement (dispense oversell race) | `services/pharmacyService.js` | ✅ |
| 3 | Appointment double-booking — partial unique index | `models/Appointment.js`, `services/appointmentService.js` | ✅ |
| 4 | Payment / refund concurrency (overpayment race) + gateway idempotency | `services/billingService.js`, `models/Payment.js` | ✅ |
| 5 | MongoDB transactions for multi-doc writes (+ replica set) | `db/withTransaction.js`, `services/inventoryService.js`, `docker-compose.yml`, `ci.yml` | ✅ |
| 6 | Money as integer paise (float drift) | `models/Invoice.js`, `Payment.js`, billing | ⬜ |

## 🔴 P0 — Security

| # | Item | Files | Status |
|---|------|-------|--------|
| 7 | `trust proxy` + portal-register limiter (auth routes were already limited) | `app.js`, `routes/portalRoutes.js`, `docker-compose.yml` | ✅ |
| 8 | Magic-byte sniffing + inert download headers (all 3 file-serving paths) | `utils/fileType.js`, `utils/serveFile.js`, `middleware/upload.js` | ✅ |
| 9 | Tenant claim required on every token (portal tokens carried none) | `utils/jwt.js`, `middleware/auth.js`, `services/portalService.js` | ✅ |
| 10 | Audit trail — full coverage + PHI read logging + immutability | `utils/audit.js`, `models/AuditLog.js`, controllers | ⬜ |
| 11 | Dynamic RBAC actually enforced (`requirePermission`) | `middleware/rbac.js`, all routes | ⬜ |
| 12 | Refresh tokens + revocation (httpOnly cookie) | `services/authService.js`, `middleware/auth.js` | ⬜ |
| 13 | Infra: Mongo auth, nginx security headers | `docker-compose.yml`, `nginx.conf` | ⬜ |

## 🟠 P1 — Reliability & Ops

| # | Item | Files | Status |
|---|------|-------|--------|
| 14 | Graceful shutdown — drain in-flight requests, then close the DB | `shutdown.js`, `server.js` | ✅ |
| 15 | Real health check (DB ping) + 503 on DB outage + friendly client errors | `routes/index.js`, `middleware/errorHandler.js`, `frontend/services/api.js` | ✅ |
| 16 | Scheduler leader-lock (duplicate reminders on multi-instance) | `services/scheduler.js` | ⬜ |
| 17 | ESLint + Prettier + CI lint step | root, `.github/workflows/ci.yml` | ⬜ |
| 18 | Test coverage expansion | `backend/tests/` | ⬜ |

## 🟠 P1 — Performance

| # | Item | Files | Status |
|---|------|-------|--------|
| 19 | Missing compound indexes | `models/*.js` | ⬜ |
| 20 | Search rewrite — `$lookup` instead of unbounded `$in` | billing/ipd/pharmacy services | ⬜ |
| 21 | Frontend code-splitting (1.28 MB single chunk) | `App.jsx`, `vite.config.js` | ⬜ |
| 22 | Single dashboard summary endpoint (11 calls → 1) | `controllers/reportController.js`, `Dashboard.jsx` | ⬜ |

## 🚀 Deployment

| # | Item | Files | Status |
|---|------|-------|--------|
| D1 | S3 storage driver (Render's disk is ephemeral) | `config/storage.js`, `middleware/upload.js`, `utils/serveFile.js`, `utils/pdf.js` | ✅ |
| D2 | Vercel + Render + Atlas deploy configs | `render.yaml`, `frontend/vercel.json`, `docs/DEPLOYMENT.md` | ✅ |
| D3 | Redis-backed rate limiting (needed before >1 instance) | `app.js` | ⬜ |
| D4 | Scheduler off the web process (BullMQ or external cron) | `services/scheduler.js` | ⬜ |

## 🐛 Found along the way

| Item | Where | Status |
|------|-------|--------|
| Insurance settlement mutated `invoice.paidAmount` directly, bypassing the atomic payment path from #4 — a settlement racing a cash payment could overshoot the total. Now goes through `recordPayment()`, and the claim's status transition is atomic so two clerks can't both settle. | `services/insuranceService.js` | ✅ |

## 🟡 P2 — UX

| # | Item | Files | Status |
|---|------|-------|--------|
| 23 | Error boundary | `components/ErrorBoundary.jsx` | ⬜ |
| 24 | Loading skeletons | `components/ui/Skeleton.jsx`, `PageLoader.jsx` | ✅ |
| 25 | Accessibility (keyboard rows, aria, focus trap) | UI components | ⬜ |
