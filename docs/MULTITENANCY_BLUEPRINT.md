# 🏢 Multi-Tenancy Blueprint — Database-per-Tenant

> ## ✅ STATUS: IMPLEMENTED
> DB-per-tenant is **live and tested** (26/26 tests, incl. cross-tenant leak
> tests). One refinement was made vs the original plan below: instead of
> threading an explicit `db` argument through every service, the tenant
> connection is carried in **AsyncLocalStorage** and models are **Proxies** that
> resolve to the current tenant's connection — so existing `User.find(...)` call
> sites are unchanged. Same architecture, far smaller diff.
>
> **Key files:** `db/registry.js`, `db/tenantContext.js` (ALS),
> `db/connectionManager.js` (`useDb` + eager model registration),
> `db/tenantModel.js` (Proxy), `middleware/tenant.js` (resolve + scope),
> `services/tenantService.js` (registry + `provisionTenant`), plus all 39 models
> converted to `register(...)` + `tenantModel(...)`.
>
> **Onboard a hospital:** `POST /api/ops/tenants { slug, name }` (or
> `npm run seed -- --tenant=<slug>`). Default tenant reuses the existing DB, so
> no data migration was needed.

**Goal:** Run many hospitals on **one deployment / one codebase**, each with its
**own MongoDB database** (`hms_<tenant>`), fully isolated.

**Scale target:** 1–25 hospitals (works well beyond, too).

**Mechanism:** `mongoose.connection.useDb(dbName, { useCache: true })` — one
shared connection pool, many databases. No per-tenant socket explosion.

> This is a **V3 milestone**, done on a branch behind a feature flag. Existing
> single-tenant deployments keep working during the migration (a `default`
> tenant), so you can ship incrementally (strangler pattern).

---

## 0. The big picture

```
                       ┌─────────────────────────────────────────┐
   apollo.hms.com ───► │  Express app (single deployment)         │
   fortis.hms.com ───► │                                          │
                       │  1. resolveTenant  (Host/JWT → tenantId) │
                       │  2. connFor(tenant) = conn.useDb(dbName) │
                       │  3. req.db = modelsFor(conn)             │
                       │  4. controllers/services use req.db.*    │
                       └───────────────┬──────────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                               ▼                              ▼
  ┌───────────────┐            ┌────────────────┐            ┌────────────────┐
  │ hms_control   │            │ hms_apollo     │            │ hms_fortis     │
  │ (control DB)  │            │ patients,users │            │ patients,users │
  │ tenants[]     │            │ invoices, …    │            │ invoices, …    │
  └───────────────┘            └────────────────┘            └────────────────┘
```

Two kinds of databases:
- **Control-plane DB** (`hms_control`) — one, shared. Holds the `Tenant` registry
  (and optionally a global email→tenant directory).
- **Tenant DBs** (`hms_apollo`, …) — one per hospital. Hold ALL the app data
  (the ~50 collections we already have).

---

## 1. The core mechanism (read this first)

Today every model is bound to the **default connection** at import time:

```js
// models/User.js  (TODAY — must change)
export const User = mongoose.model('User', userSchema);
```

That permanently binds `User` to one database. For per-tenant we instead:

1. Export **schemas** (not bound models).
2. At request time, get the tenant's DB handle and register/fetch models on it.

```js
// db/connectionManager.js  (NEW)
import mongoose from 'mongoose';

// One base connection (pool). useDb() gives per-database handles that SHARE it.
export function tenantConnection(dbName) {
  return mongoose.connection.useDb(dbName, { useCache: true });
}
```

```js
// db/models.js  (NEW) — bind all schemas onto a given connection, once.
import { userSchema } from '../models/User.js';
import { patientSchema } from '../models/Patient.js';
// … import every schema

const SCHEMAS = { User: userSchema, Patient: patientSchema, /* …all */ };

export function modelsFor(conn) {
  const db = {};
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    db[name] = conn.models[name] || conn.model(name, schema); // guard re-register
  }
  return db;
}
```

```js
// middleware/tenant.js  (NEW)
import { tenantConnection } from '../db/connectionManager.js';
import { modelsFor } from '../db/models.js';

export function attachTenantDb(req, _res, next) {
  const conn = tenantConnection(req.tenant.dbName); // req.tenant set by resolver
  req.db = modelsFor(conn);
  next();
}
```

Then **controllers/services use `req.db.User` instead of importing `User`.**
That single change is what makes the app multi-tenant.

---

## 2. Tenant resolution strategy

**Recommended: subdomain** (`apollo.hms.com`). Cleanest, and lets different
hospitals reuse the same email addresses.

| Strategy | How | Notes |
|---|---|---|
| **Subdomain** ✅ | `Host` header → tenant slug | No global user directory needed |
| JWT claim | `tenantId` inside the token | Good after login; still need to resolve at login |
| Login tenant-code | user picks/enters hospital code | Simple, one shared host, extra field on login |

Resolution order at runtime:
1. **Before auth** (for login): resolve tenant from subdomain (or a `tenantCode`
   field in the login body).
2. **After auth**: the JWT carries `tenantId`; verify it matches the host.

```js
// middleware/resolveTenant.js  (NEW)
import { getTenantBySlug } from '../services/tenantService.js';

export async function resolveTenant(req, res, next) {
  const host = req.headers.host || '';
  const slug = host.split('.')[0];                 // apollo.hms.com → "apollo"
  const tenant = await getTenantBySlug(slug) ||
                 (req.body?.tenantCode && await getTenantBySlug(req.body.tenantCode));
  if (!tenant || tenant.status !== 'ACTIVE') {
    return res.status(404).json({ success: false, message: 'Unknown hospital' });
  }
  req.tenant = tenant;
  next();
}
```

---

## 3. Control plane (new, shared DB)

```js
// controlplane/models/Tenant.js  (NEW — lives on hms_control)
const tenantSchema = new mongoose.Schema({
  slug:   { type: String, required: true, unique: true },  // "apollo"
  name:   { type: String, required: true },                // "Apollo Hospital"
  dbName: { type: String, required: true, unique: true },  // "hms_apollo"
  status: { type: String, enum: ['ACTIVE','SUSPENDED'], default: 'ACTIVE' },
  createdAt: Date,
}, { timestamps: true });
```

`tenantService`:
- `getTenantBySlug(slug)` — cached lookup (in-memory Map, small TTL)
- `createTenant({ slug, name })` — inserts registry row **+ provisions the DB**
  (runs the seed against `hms_<slug>`)
- `listTenants()` / `suspendTenant()` — super-admin ops

---

## 4. Auth flow redesign

Login becomes tenant-scoped:

```
POST apollo.hms.com/api/auth/login  { email, password }
  → resolveTenant   (host → apollo)
  → attachTenantDb  (req.db = apollo models)
  → authService.login(body, req.db)      // validates against apollo.users
  → JWT: { sub, role, tenantId }         // tenant baked into token
```

Changes:
- `utils/jwt.js` — include `tenantId` in `signToken` payload.
- `middleware/auth.js` — after verifying JWT, set `req.tenant` from the token's
  `tenantId`, then `attachTenantDb`, then load the user via `req.db.User`.
- `authService.loginUser(body, db)` — takes `db` (no global `User` import).

**Order of middleware matters** on every protected route:
`resolveTenant → attachTenantDb → authenticate → authorize → handler`.

---

## 5. What changes, file by file

### 5.1 Models — `src/models/*.js` (~50 files) 🔴 biggest
Convert each from *export model* to *export schema*:
```diff
- export const User = mongoose.model('User', userSchema);
+ export { userSchema };
```
Keep the schema definitions exactly as they are (virtuals, hooks, indexes all
carry over). Register them centrally in `db/models.js` (Section 1).

> **Counter** (`models/Counter.js`) needs no special work — because each tenant
> DB has its own `counters` collection, sequences (`HMS-2026-000001`, `INV-…`)
> are **automatically isolated** per hospital. This is a big win vs shared-DB.

### 5.2 Services — `src/services/*.js` (~25 files) 🔴
Stop importing models; receive them:
```diff
- import { Patient } from '../models/Patient.js';
- export async function getPatient(id) {
-   return Patient.findById(id);
+ export async function getPatient(db, id) {
+   return db.Patient.findById(id);
  }
```
Cross-service calls pass `db` down (e.g. `portalService` → `appointmentService`).

### 5.3 Controllers — `src/controllers/*.js` (~26 files)
Pass `req.db` into services:
```diff
- data: await service.getPatient(req.params.id)
+ data: await service.getPatient(req.db, req.params.id)
```

### 5.4 Middleware
- **NEW** `resolveTenant.js`, `tenant.js` (attachTenantDb).
- **EDIT** `auth.js` — tenant-aware (Section 4).
- Route files (`routes/*.js`): prepend `resolveTenant, attachTenantDb` (or apply
  globally in `app.js` before `/api`).

### 5.5 Config / bootstrap
- **NEW** `db/connectionManager.js`, `db/models.js`.
- **EDIT** `config/database.js` — connect the base connection to the cluster
  (default DB = control). `mongoose.connect(BASE_URI)`.
- **NEW** `controlplane/` — Tenant model + `tenantService` + super-admin routes.
- **EDIT** `config/env.js` — add `MONGO_BASE_URI`, `CONTROL_DB=hms_control`,
  `TENANCY=subdomain|code`, base domain.

### 5.6 Seed / onboarding — `src/seed/seed.js`
Split into:
- `seedControlPlane()` — ensures `hms_control` + a first tenant row.
- `seedTenant(dbName)` — runs the EXISTING seed logic against one tenant DB
  (roles, admin, departments, demo data). Called on tenant creation.

Onboarding a hospital = `createTenant()` → creates registry row → `seedTenant()`.

### 5.7 Super-admin (cross-tenant) — NEW
A platform-level admin (on the control plane) to create/list/suspend tenants.
Cross-hospital reports = loop tenants, query each `modelsFor(conn)`, merge.

### 5.8 Frontend
- **Tenant context**: derive from subdomain (or a hospital picker on login).
- **Login**: post to the tenant host (or send `tenantCode`).
- Axios `baseURL` already relative (`/api`) → works per-subdomain automatically.
- Optional: super-admin "switch hospital" UI (platform console).

### 5.9 Tests
- Test helper spins up two tenant DBs; assert **isolation** (tenant A can't read
  tenant B). Add a "no cross-tenant leak" test — the headline safety guarantee.

---

## 6. Migrating existing (single-tenant) data
1. Pick a slug for the current hospital, e.g. `default`.
2. `mongodump` the current `hospital_management` DB → `mongorestore` into
   `hms_default`.
3. Insert a `Tenant{ slug:'default', dbName:'hms_default' }` control-plane row.
4. Point `default.localhost` (or a `tenantCode=default`) at it. Verify login.

---

## 7. Gotchas & how to avoid them

| Gotcha | Fix |
|---|---|
| `OverwriteModelError` (model registered twice on a conn) | `conn.models[name] \|\| conn.model(name, schema)` guard (in `modelsFor`) |
| Forgetting to pass `db` into a service | Lint rule / grep for `import.*models/`; services must take `db` |
| Cross-tenant leak | Never import models globally in request paths; only via `req.db`. Add the isolation test. |
| Connection limits | `useDb({ useCache:true })` shares ONE pool — non-issue at this scale |
| Cross-DB transactions | Not supported across tenant DBs — none of our flows need it |
| Tenant lookup on every request | Cache `getTenantBySlug` (Map + short TTL) |
| Separate clusters per tenant (future) | Swap `useDb` → `createConnection(uri)` keyed by tenant; same `modelsFor` factory |

---

## 8. Phase-by-phase execution plan

| Phase | Work | Output |
|---|---|---|
| **0** | Branch `feat/multitenancy`, feature flag, plan the `default` tenant | Safe migration base |
| **1** | Control plane: `Tenant` model + `tenantService` + control DB connect | Registry works |
| **2** | `connectionManager` + `modelsFor` + convert **1 model** (Patient) as POC | Pattern proven end-to-end |
| **3** | Convert **all ~50 models** to schema-export; wire `db/models.js` | Models per-tenant |
| **4** | Refactor **services** to take `db`; **controllers** pass `req.db` | Data layer tenant-scoped |
| **5** | `resolveTenant` + `attachTenantDb` + auth/JWT tenant-aware | Requests routed to right DB |
| **6** | `seedTenant()` + onboarding flow + super-admin routes | Create hospitals |
| **7** | Frontend tenant context + login + (optional) super-admin console | UX complete |
| **8** | Isolation tests + migrate existing data + docs | Ship |

**Biggest lift = Phases 3–4** (mechanical but broad). Do Phase 2 POC first and
confirm the pattern before the bulk conversion.

---

## 9. Acceptance checklist
- [ ] Two hospitals can be created; each gets a seeded DB
- [ ] Login on `apollo.` only sees Apollo data; `fortis.` only Fortis
- [ ] IDs (`HMS-…`, `INV-…`) restart per hospital, no clash
- [ ] Same email can exist in two hospitals independently
- [ ] Automated "no cross-tenant leak" test passes
- [ ] Existing single-tenant data migrated into `hms_default` and works
- [ ] Super-admin can create/suspend a hospital and run a cross-tenant report
- [ ] Backup/restore of one hospital = one DB dump/restore

---

## 10. Effort & recommendation
- **Effort:** Phases 1–2 small; Phases 3–4 the bulk (broad but mechanical);
  5–8 moderate. Plan it as a dedicated milestone, not a side change.
- **Do it behind a flag** with a `default` tenant so nothing breaks mid-way.
- **Start with the Phase-2 POC** — it de-risks everything else.
