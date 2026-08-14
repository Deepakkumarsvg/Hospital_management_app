# 🚀 HMS — V2 Roadmap & Status

V1 (Phases 1–7) is complete, tested, and deployable. This document lists the
**V2 scope** — the next wave of features that build on the V1 foundation.

Priorities: **P0** = highest business value / most requested, **P1** = important,
**P2** = nice-to-have.

## ✅ V2 delivery status

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Patient Portal | ✅ Done | + reschedule, teleconsult booking, online pay, PDFs |
| 2 | Email / SMS channels | ✅ Done | Driver pattern; **dev-log fallback**, real on SMTP/Twilio env |
| 3 | Online Payments | ✅ Done | Razorpay driver + **mock mode** (works with no keys); webhook |
| 4 | Appointment reminders | ✅ Done | Hourly scheduler + admin trigger; sends via channels |
| 5 | Telemedicine | ✅ Done | **Jitsi** video rooms (no credentials needed) |
| 6 | Advanced reports / exports | ✅ Done | Doctor activity + CSV/XLSX export |
| 7 | Dynamic RBAC | ✅ Done | Permission catalog + editable matrix (role-based enforcement) |
| 8 | Clinical depth | ✅ Done | Discharge summary PDF + ICD-10 fields (OPD & IPD) |
| 9 | Platform / infra | 🟡 Partial | pino logging + request-id ✅, CI ✅, S3 driver = extension point |
| 10 | Multi-tenancy | ⛔ Deferred | Dedicated architecture effort — see note below |
| 11 | Analytics / intelligence | 🟡 Partial | Drug-allergy alert ✅; forecasting/ML deferred |
| 12 | Mobile / PWA | ✅ Done | Installable PWA (manifest + service worker) |

> **Config for real providers** (all optional — omit for dev): SMTP_* (email),
> SMS_PROVIDER/TWILIO_* (SMS), RAZORPAY_* (payments). See `backend/.env.example`.
>
> **#10 Multi-tenancy** is intentionally deferred: supporting multiple isolated
> hospitals/branches touches every model (tenant scoping), auth, and queries —
> a focused project rather than an incremental feature. Recommended as its own
> milestone.

---

## 1. Patient Portal & Self-Service  · P0  — ✅ SHIPPED (V2.1)
A separate authenticated experience for patients themselves.
- [x] `PATIENT` role + patient↔user linkage, self-registration + login
- [x] Dedicated portal layout, role-based routing (portal ⇄ staff are mutually exclusive)
- [x] Book / cancel own appointments (doctor picker, ownership-guarded)
- [x] View prescriptions, lab & radiology reports; download prescription PDFs
- [x] View bills + download invoice PDFs (all scoped to own data)
- [x] Profile view
- [ ] Remaining: OTP/email verification, reschedule, document uploads, **online payment** (see #3)

## 2. Communication Channels (Email / SMS / WhatsApp)  · P0
The `notify()` service is already channel-agnostic — add real adapters.
- Email adapter (SMTP / SendGrid) — invoices, reports, welcome
- SMS adapter (Twilio / MSG91) — appointment + payment confirmations
- WhatsApp adapter (Cloud API) — reminders
- Notification templates + per-user channel preferences
- **Depends on:** a queue/worker for retries (see #9).

## 3. Online Payments  · P0
- Razorpay / Stripe integration on invoices
- Payment links (send to patient), webhook reconciliation
- Auto-mark invoice PAID on successful capture; refunds
- **Depends on:** #1 for patient-initiated payments.

## 4. Appointment Reminders & Scheduling+  · P1
- Cron-based reminders (24h / 2h before) via #2
- Doctor leave / OPD slot blocking; visible slot capacity
- Waitlist + auto-fill on cancellation
- Recurring / follow-up auto-scheduling

## 5. Telemedicine  · P1
- Video consultation (WebRTC / Twilio Video / Daily) linked to an appointment
- In-consult chat + share prescription at end
- E-consultation billing

## 6. Advanced Reporting & Exports  · P1
- Excel/CSV export on every list (server-side)
- GST / tax reports, day-book, doctor-wise revenue, TPA/insurance ageing
- Scheduled report emails (daily/weekly)
- Configurable dashboard widgets per role

## 7. Dynamic Roles & Permissions  · P1
- Permission matrix editor UI (roles are currently code-defined)
- Custom roles + granular per-module permissions
- Field-level access (e.g. hide financials from nurses)

## 8. Clinical Depth  · P1
- Structured diagnosis coding (ICD-10)
- Lab reference-range flagging (auto high/low), cumulative trend graphs
- Discharge summary generator (PDF) from IPD data
- Nursing charts / MAR (medication administration record)
- Consent forms + e-signature

## 9. Platform / Infrastructure  · P1
- Background job queue (BullMQ + Redis) for notifications, reminders, PDFs
- Object storage driver (S3/GCS) wired to the existing storage interface
- Structured logging (pino) + request IDs, error tracking (Sentry)
- CI pipeline (lint + test + build) and image publishing
- Rate-limit tuning per-route; refresh tokens / session revocation

## 10. Multi-tenancy & Branches  · P2
- Multiple hospital branches / clinics under one deployment
- Per-branch inventory, staff, and reporting
- Central admin across branches

## 11. Analytics & Intelligence  · P2
- Bed-occupancy forecasting, no-show prediction
- Drug interaction / allergy alerts at prescribing time
- Revenue and demand dashboards with drill-down

## 12. Mobile & Offline  · P2
- PWA (installable, offline-capable OPD/queue)
- Native wrapper (Capacitor) for staff app
- Barcode / QR for patient wristbands, sample tracking

---

## Cross-cutting quality (carry-over)
- [ ] Expand automated test coverage to every module (only auth/RBAC/patient/settings/invoice covered in V1)
- [ ] E2E tests (Playwright) for critical flows
- [ ] Accessibility audit (ARIA, keyboard nav, contrast)
- [ ] Loading skeletons instead of spinners
- [ ] Bulk actions (multi-select) on list pages
- [ ] i18n (Hindi/regional languages)

## Suggested V2 sequencing
1. **Foundation:** #9 (queue + S3 + logging) — unblocks reminders/notifications/PDF-at-scale
2. **Patient-facing:** #1 Patient Portal → #3 Online Payments → #2 Channels
3. **Engagement:** #4 Reminders → #5 Telemedicine
4. **Admin power:** #6 Reports → #7 Dynamic RBAC → #8 Clinical depth
5. **Scale:** #10 Multi-tenancy → #11 Analytics → #12 Mobile
