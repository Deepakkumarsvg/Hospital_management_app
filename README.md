# 🏥 Hospital Management System (HMS)

A production-oriented **Hospital Management System** built with the MERN stack
(MongoDB, Express, React, Node.js). Modular, role-based (RBAC), API-driven, and
fully responsive with a **black & white design system** supporting **light and
dark themes**.

> **Status: V1 COMPLETE ✅** (Phases 1–7 done)
> Every V1 module is built and tested: Foundation, Core (Patients/Doctors/
> Appointments/Users), Clinical (OPD/IPD/Beds), Diagnostics (Lab/Radiology/
> Reports), Pharmacy & Inventory, Finance (Billing/Payments/Insurance), and
> Advanced (OT, Blood Bank, HR, Ambulance, Notifications, Audit Logs).

---

## 📦 Tech Stack

| Layer      | Tech                                                                 |
| ---------- | ------------------------------------------------------------------- |
| Frontend   | React 18, Vite, React Router, Axios, Tailwind CSS, React Hook Form, Recharts, Lucide |
| Backend    | Node.js, Express, Mongoose, JWT, bcryptjs, Helmet, Zod, express-rate-limit |
| Database   | MongoDB                                                             |

---

## 🗂 Project Structure

```
hospital-management/
├── backend/          # Express REST API
│   └── src/
│       ├── config/       # db connection, roles
│       ├── controllers/  # request handlers
│       ├── middleware/    # auth, rbac, validate, errorHandler
│       ├── models/        # Mongoose schemas (User, Role, Department, …)
│       ├── routes/        # API routers
│       ├── services/      # business logic
│       ├── validators/    # Zod schemas
│       ├── utils/         # ApiError, jwt, apiResponse
│       └── seed/          # seed script (roles + admin)
├── frontend/         # React + Vite SPA
│   └── src/
│       ├── components/   # reusable UI (Button, Input, Card, …)
│       ├── context/      # AuthContext, ThemeContext
│       ├── layouts/      # Sidebar, Topbar, DashboardLayout
│       ├── pages/        # Login, Dashboard, NotFound
│       ├── routes/       # ProtectedRoute
│       ├── services/     # api.js (axios), authService
│       └── utils/        # navigation, cn
└── docs/             # SETUP.md, DATABASE.md, API_DOCUMENTATION.md
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MongoDB running locally (or a connection string)

> No local MongoDB? Run one with Docker:
> ```bash
> docker run -d --name hms-mongo -p 27017:27017 -v hms-mongo-data:/data/db mongo:7
> ```

### 1. Backend
```bash
cd backend
cp .env.example .env      # edit values as needed (JWT_SECRET is validated at startup)
npm install
npm run seed              # roles, departments, admin
npm run seed:fresh        # + rich demo data (doctors, patients, catalogues, wards/beds, stock)
npm run dev               # http://localhost:5000
npm test                  # run the Vitest suite (needs a local MongoDB)
```

> **Demo logins after `seed:fresh`** — one account per role, password pattern
> `<Role>@123` (e.g. `ravi@hms.local` / `Doctor@123`, `neha@hms.local` /
> `Account@123`).

### 2. Frontend
```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

Vite proxies `/api` → `http://localhost:5000`, so no CORS setup is needed in dev.

### 3. One-command deploy (Docker)
```bash
cp .env.docker.example .env         # set a strong JWT_SECRET
docker compose up -d --build        # mongo + API + nginx-served frontend
docker compose exec backend npm run seed:fresh
# open http://localhost:8080
```

### 4. Login
Open http://localhost:5173 and sign in:

| Email             | Password    | Role        | Lands on   |
| ----------------- | ----------- | ----------- | ---------- |
| admin@hms.local   | Admin@123   | SUPER_ADMIN | /dashboard |
| patient@hms.local | Patient@123 | PATIENT     | /portal    |

> **Patient Portal** — patients sign in (or self-register at `/portal/register`)
> to book appointments, view prescriptions & lab reports, and download invoice
> PDFs. Patients only ever see their own data; the portal and staff areas are
> mutually exclusive by role.

---

## 🔐 Environment Variables (`backend/.env`)

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/hospital_management
JWT_SECRET=change_this_secret
JWT_EXPIRES_IN=1d
CLIENT_URL=http://localhost:5173
SEED_ADMIN_EMAIL=admin@hms.local
SEED_ADMIN_PASSWORD=Admin@123
```

> **Never commit `.env`.** Only `.env.example` is tracked.

---

## 🧩 What's Implemented (Phase 1)

- [x] React + Vite frontend, Node + Express backend
- [x] MongoDB connection + Mongoose models (User, Role, Department)
- [x] JWT authentication (login / logout / me)
- [x] Password hashing (bcrypt), no plain-text storage
- [x] RBAC middleware (12 roles, SUPER_ADMIN override)
- [x] Protected routes on the frontend
- [x] Responsive dashboard layout (sidebar + topbar + mobile drawer)
- [x] Role-based sidebar navigation
- [x] Dashboard with stat cards + Recharts (sample data)
- [x] Black & white design system + **light/dark theme toggle**
- [x] Centralized error handling + standard API response format
- [x] Server-side pagination + search (users endpoint)
- [x] Seed script (roles, departments, admin)
- [x] Security: Helmet, CORS, rate limiting, input validation (Zod)

## 🧩 What's Implemented (Phase 2 — Core)
- [x] **Patients** — CRUD, auto UHID (`HMS-2026-000001`), search, status filter, pagination, detail page
- [x] **Departments** — CRUD (admin)
- [x] **Doctors** — CRUD, department link, weekly availability, consultation fee, detail page
- [x] **Appointments** — booking (patient picker + department→doctor cascade), auto `APT-…`, double-booking guard, status workflow (check-in → in-progress → complete / cancel / no-show), reschedule
- [x] **Users** — management (create/edit/delete, role assignment, self-lockout guards)
- [x] **Roles** — roles page + access matrix
- [x] **Patient documents** — upload / download / delete via configurable storage layer (local, S3-ready)
- [x] **Role-aware dashboard** — doctors get a personal "today's schedule" view; admin KPIs wired to real APIs
- [x] Reusable UI: Modal, Select, Badge, Pagination, EmptyState, ConfirmDialog, Toast

## 🧩 What's Implemented (Phase 3 — Clinical)
- [x] **OPD** — start visit → vitals, symptoms, diagnosis, clinical notes, **prescription editor**, follow-up; completing a visit locks it and closes the appointment
- [x] **IPD** — admit (bed auto-occupied) → nursing notes → **bed transfer** → discharge (bed auto-freed); length-of-stay tracking
- [x] **Wards / Rooms / Beds** — CRUD + **visual bed map** with live status (available / occupied / reserved / maintenance)
- [x] **Medical Records** — patient profile surfaces full clinical history (Appointments, OPD visits, IPD admissions, Prescriptions, Documents) via tabs

## 🛣 Roadmap
- **Phase 2 — Core:** ✅ Patients · Departments · Doctors · Appointments · Users
- **Phase 3 — Clinical:** ✅ OPD · IPD · Wards/Rooms/Beds
- **Phase 4 — Diagnostics:** ✅ Laboratory · Radiology · Reports
- **Phase 5 — Pharmacy & Inventory:** ✅ Pharmacy · Inventory · Vendors · Purchase Orders
- **Phase 6 — Finance:** ✅ Billing · Payments · Insurance claims
- **Phase 7 — Advanced:** ✅ OT · Blood Bank · HR · Ambulance · Notifications · Audit Logs

> **ICU note:** ICU is modelled as an `ICU` ward type managed through the
> existing Beds + IPD modules (ICU admissions = IPD admissions into ICU beds),
> rather than a separate module.
> **Extensibility note:** Notifications are in-app; the service is channel-
> agnostic so Email/SMS/WhatsApp can be added behind the same `notify()` call.
- **Phase 3 — Clinical:** OPD, IPD, Wards/Rooms/Beds, Prescriptions
- **Phase 4 — Diagnostics:** Laboratory, Radiology, Reports
- **Phase 5 — Pharmacy & Inventory**
- **Phase 6 — Finance:** Billing, Payments, Insurance
- **Phase 7 — Advanced:** OT, ICU, Blood Bank, HR, Notifications, Audit Logs

## 🛡 V1+ Hardening & Ops
- [x] **Startup env validation** — server refuses to boot on missing/weak `JWT_SECRET` or unsafe prod CORS
- [x] **Rich demo seed** (`npm run seed:fresh`) — staff, doctors, patients, lab/radiology catalogues, medicines + stock, vendors, inventory, wards/rooms/beds
- [x] **Server-side PDF** — invoices (`GET /api/billing/invoices/:id/pdf`) and prescriptions (`GET /api/opd/:id/pdf`), branded from Settings
- [x] **Settings module** — hospital profile / tax / branding (`/settings`, admin-editable)
- [x] **Revenue analytics** — billed/collected/due, revenue-by-category, collection trend on Reports
- [x] **Docker Compose** — one-command full-stack deploy (mongo + API + nginx)
- [x] **Automated tests** — Vitest + Supertest (auth, RBAC, patients, settings, invoice math)

## 🚀 V2 Features (shipped)
- [x] **Patient Portal** — self-register, book/reschedule/cancel, records & bills, PDFs, online pay
- [x] **Online Payments** — Razorpay driver + **mock mode** (works with no keys), webhook, auto-PAID
- [x] **Telemedicine** — Jitsi video rooms on appointments (no credentials required)
- [x] **Email / SMS channels** — driver pattern, dev-log fallback, real on SMTP/Twilio env
- [x] **Appointment reminders** — hourly scheduler + admin trigger (`POST /api/ops/reminders/run`)
- [x] **Advanced reports** — doctor-activity + CSV/Excel exports
- [x] **Dynamic RBAC** — permission catalog + editable per-role matrix
- [x] **Clinical depth** — discharge summary PDF + ICD-10 codes (OPD & IPD)
- [x] **Drug-allergy alerts** — live at prescribing time
- [x] **PWA** — installable, offline app shell
- [x] **Ops/infra** — pino request logging (+ `X-Request-Id`), CI workflow, S3 storage extension point

Integration keys are all optional (dev works without them) — see `backend/.env.example`.
Full status + what's deferred (ML analytics): **[V2 Roadmap](./docs/V2_ROADMAP.md)**.

## 🏢 V3 — Multi-Tenancy (DB-per-Tenant) — shipped
Run many hospitals on one deployment, each with its **own isolated MongoDB
database** (`hms_<slug>`). Cross-tenant data access is impossible (proven by
tests). Single-tenant deployments keep working unchanged via a `default` tenant
that reuses the existing DB — **no migration needed**.

- **Onboard a hospital:** the **Hospitals** admin console (`/hospitals`) — add a hospital and it provisions an isolated DB + admin; or `POST /api/ops/tenants { "slug", "name" }`, or `npm run seed:tenant=<slug>`.
- **Pick a tenant:** the login page has a **Hospital code** field (the frontend sends `X-Tenant`); in production use subdomains (`apollo.hms.local`) via `TENANCY_MODE=subdomain`.
- **Security:** a JWT minted for one hospital is rejected on another (`TENANT_MISMATCH`).
- **How it works:** `useDb()` (one pool, many DBs) + AsyncLocalStorage tenant context + model Proxies. See the **[Multi-Tenancy Blueprint](./docs/MULTITENANCY_BLUEPRINT.md)**.

See [docs/](./docs) for details.
# Hospital_management_app
