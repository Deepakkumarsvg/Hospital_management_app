# API Documentation

Base URL: `http://localhost:5000/api`

## Response Format

Success:
```json
{ "success": true, "message": "…", "data": { } }
```

Paginated success:
```json
{ "success": true, "message": "…", "data": [], "pagination": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 } }
```

Error:
```json
{ "success": false, "message": "…", "error": "ERROR_CODE" }
```

## Authentication
All protected endpoints require: `Authorization: Bearer <JWT>`

### POST `/auth/login`
Body: `{ "email": "admin@hms.local", "password": "Admin@123" }`
→ `{ token, user }`

### GET `/auth/me` 🔒
Returns the current user.

### POST `/auth/logout` 🔒
Stateless — client discards the token.

## Users 🔒 `ADMIN` / `SUPER_ADMIN`
- **GET** `/users?page&limit&search&role` — paginated + searchable.
- **GET** `/users/roles` — role catalogue (for dropdowns).
- **POST** `/users` — create (name, email, password, role required).
- **PUT** `/users/:id` — update (password optional; self role-change / self-deactivate blocked).
- **DELETE** `/users/:id` — delete (cannot delete self).

## Departments
Read: any authenticated user. Manage: `ADMIN`.
- **GET** `/departments?page&limit&search&status` · **GET** `/departments/active` · **GET** `/departments/:id`
- **POST** / **PUT** `/departments/:id` / **DELETE** `/departments/:id`

## Doctors
Read: any authenticated user. Manage: `ADMIN`.
- **GET** `/doctors?page&limit&search&department&status` · **GET** `/doctors/active?department=` · **GET** `/doctors/stats` · **GET** `/doctors/me` (profile linked to logged-in user) · **GET** `/doctors/:id`
- **POST** / **PUT** `/doctors/:id` / **DELETE** `/doctors/:id`
- Fields: firstName, registrationNo (unique), specialization, department, qualification, experienceYears, phone, consultationFee, availability[{day,from,to}].

## Appointments
View: `ADMIN`,`DOCTOR`,`NURSE`,`RECEPTIONIST`. Book/edit: `ADMIN`,`RECEPTIONIST`. Status: + `DOCTOR`,`NURSE`. Delete: `ADMIN`.
- **GET** `/appointments?page&limit&status&doctor&patient&date` · **GET** `/appointments/stats` · **GET** `/appointments/:id`
- **POST** `/appointments` — auto `APT-YYYY-000001`; blocks doctor double-booking (`SLOT_TAKEN`).
- **PUT** `/appointments/:id` — reschedule/edit (locked once COMPLETED/CANCELLED/NO_SHOW).
- **PATCH** `/appointments/:id/status` — `{status}`; enforces the transition graph.
- **DELETE** `/appointments/:id`.
- Status flow: `BOOKED → CHECKED_IN → IN_PROGRESS → COMPLETED`; any active state → `CANCELLED`/`NO_SHOW`.

## Patients
View roles: `ADMIN`, `DOCTOR`, `NURSE`, `RECEPTIONIST`. Edit: `ADMIN`, `RECEPTIONIST`. Delete: `ADMIN`.

### GET `/patients?page=1&limit=20&search=&status=ALL&sort=newest` 🔒
Paginated list. `search` matches UHID / name / phone / email. `status` = `ALL|ACTIVE|INACTIVE`. `sort` = `newest|oldest|name`.

### GET `/patients/stats` 🔒
`{ total, active, inactive }`.

### GET `/patients/:id` 🔒
Single patient (with `age`, `fullName` virtuals; `createdBy` populated).

### POST `/patients` 🔒 `ADMIN` / `RECEPTIONIST`
Registers a patient. **UHID is auto-generated** (`HMS-YYYY-000001`, year-scoped, atomic counter).
Required: `firstName`, `gender`, `dateOfBirth`, `phone`.

### PUT `/patients/:id` 🔒 `ADMIN` / `RECEPTIONIST`
Update. `uhid` and `createdBy` are immutable.

### DELETE `/patients/:id` 🔒 `ADMIN`
Permanently removes a patient.

### Patient Documents 🔒
Stored via a configurable storage layer (local disk now; S3/GCS behind the same interface). Metadata in Mongo, binaries on disk. Max 5 MB; PDF/JPG/PNG/WEBP.
- **GET** `/patients/:id/documents` — list.
- **POST** `/patients/:id/documents` — multipart (`file`, `category`) · `ADMIN`/`RECEPTIONIST`.
- **GET** `/patients/:id/documents/:docId/download` — stream file.
- **DELETE** `/patients/:id/documents/:docId` · `ADMIN`/`RECEPTIONIST`.

## Health
### GET `/health`
Liveness probe.

---

## Roles (RBAC)
`SUPER_ADMIN` (bypasses all checks), `ADMIN`, `DOCTOR`, `NURSE`, `RECEPTIONIST`,
`LAB_TECHNICIAN`, `RADIOLOGIST`, `PHARMACIST`, `ACCOUNTANT`, `STORE_MANAGER`,
`OT_STAFF`, `HR`.

## Error Codes (partial)
`NO_TOKEN`, `INVALID_TOKEN`, `USER_NOT_FOUND`, `ACCOUNT_INACTIVE`,
`INVALID_CREDENTIALS`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`,
`DUPLICATE_KEY`, `ROUTE_NOT_FOUND`, `SERVER_ERROR`.

## OPD (Outpatient)
View: `ADMIN`,`DOCTOR`,`NURSE`,`RECEPTIONIST`. Edit: `ADMIN`,`DOCTOR`,`NURSE`. Delete: `ADMIN`.
- **GET** `/opd?page&limit&status&doctor&patient&date` · **GET** `/opd/stats` · **GET** `/opd/:id`
- **POST** `/opd` — start a visit (auto `OPD-YYYY-000001`; advances a linked appointment to IN_PROGRESS).
- **PUT** `/opd/:id` — record vitals, symptoms, diagnosis, clinical notes, prescription[], follow-up; `status: COMPLETED` locks it and completes the appointment.
- **DELETE** `/opd/:id`.

## Wards / Rooms / Beds
Read: any authenticated user. Structural changes: `ADMIN` (beds: `NURSE` may flip RESERVED/MAINTENANCE).
- **Wards:** `GET/POST /wards`, `PUT/DELETE /wards/:id`
- **Rooms:** `GET/POST /rooms?ward=`, `PUT/DELETE /rooms/:id`
- **Beds:** `GET /beds?ward&status`, `GET /beds/available?ward=`, `GET /beds/map`, `POST /beds`, `PUT/DELETE /beds/:id`
- Bed status: `AVAILABLE / OCCUPIED / RESERVED / MAINTENANCE` (OCCUPIED is driven by IPD, not set manually).

## IPD (Inpatient)
View: `ADMIN`,`DOCTOR`,`NURSE`,`RECEPTIONIST`. Admit/transfer/discharge: `ADMIN`,`DOCTOR`,`RECEPTIONIST`. Notes: + `NURSE`.
- **GET** `/ipd?page&limit&status&patient` · **GET** `/ipd/stats` · **GET** `/ipd/:id`
- **POST** `/ipd` — admit (auto `IPD-YYYY-000001`; marks the bed OCCUPIED; blocks unavailable beds).
- **PUT** `/ipd/:id` — update reason/diagnosis/doctor (while ADMITTED).
- **POST** `/ipd/:id/notes` — add a nursing note.
- **PATCH** `/ipd/:id/transfer` — move to another available bed (frees old, occupies new).
- **PATCH** `/ipd/:id/discharge` — discharge + free the bed; sets `dischargeDate`.

## Laboratory
View: `ADMIN`,`DOCTOR`,`NURSE`,`LAB_TECHNICIAN`,`RECEPTIONIST`. Order: `ADMIN`,`DOCTOR`. Results: `ADMIN`,`LAB_TECHNICIAN`. Test master: `ADMIN`.
- **Tests:** `GET /laboratory/tests`, `GET /laboratory/tests/active`, `POST/PUT/DELETE /laboratory/tests/:id`
- **Orders:** `GET /laboratory/orders?page&limit&status&patient`, `GET /laboratory/orders/stats`, `GET /laboratory/orders/:id`
  - `POST /laboratory/orders` — auto `LAB-YYYY-000001` (send `tests:[ids]` and/or ad-hoc `items:[]`)
  - `PUT /laboratory/orders/:id/results` — enter results (→ COMPLETED)
  - `PATCH /laboratory/orders/:id/status` — ORDERED → SAMPLE_COLLECTED → PROCESSING → COMPLETED → VERIFIED (or CANCELLED)

## Radiology
View: `ADMIN`,`DOCTOR`,`RADIOLOGIST`,`NURSE`,`RECEPTIONIST`. Order: `ADMIN`,`DOCTOR`. Report: `ADMIN`,`RADIOLOGIST`. Test master: `ADMIN`.
- **Tests:** `GET /radiology/tests`, `GET /radiology/tests/active`, `POST/PUT/DELETE /radiology/tests/:id`
- **Orders:** `GET /radiology/orders?…`, `GET /radiology/orders/stats`, `GET /radiology/orders/:id`
  - `POST /radiology/orders` — auto `RAD-YYYY-000001`
  - `PATCH /radiology/orders/:id/status` — ORDERED → SCHEDULED → COMPLETED (or CANCELLED)
  - `PUT /radiology/orders/:id/report` — findings + impression (→ REPORTED)

## Reports
`ADMIN`, `ACCOUNTANT`.
- **GET** `/reports/summary?from=&to=` — totals (patients, OPD, IPD, lab, radiology, current admissions, active doctors), bed status + occupancy rate, and status breakdowns for appointments / OPD / lab / radiology.

## Pharmacy
View: `ADMIN`,`PHARMACIST`,`DOCTOR`,`NURSE`. Manage/dispense: `ADMIN`,`PHARMACIST`.
- **Medicines:** `GET /pharmacy/medicines?page&limit&search&lowStock`, `GET /pharmacy/medicines/active`, `GET /pharmacy/medicines/:id` (with batches), `POST/PUT/DELETE`
- **Stock in:** `POST /pharmacy/medicines/:id/batches` — batchNo, expiryDate, quantity (increments stock)
- **Dispense:** `POST /pharmacy/dispense` — auto `PH-YYYY-000001`; reduces stock **FEFO** (first-expiry-first-out); blocks insufficient stock
- `GET /pharmacy/dispenses`, `GET /pharmacy/expiring?days=90`, `GET /pharmacy/stats`

## Inventory
View/Manage: `ADMIN`, `STORE_MANAGER`.
- **Items:** `GET /inventory/items?page&limit&search&category&lowStock`, `POST/PUT/DELETE`, `GET /inventory/items/:id/transactions`
- **Stock adjust:** `POST /inventory/items/:id/adjust` — type IN/OUT/ADJUST (writes a StockTransaction; blocks negative stock)
- **Vendors:** `GET/POST /inventory/vendors`, `PUT/DELETE /inventory/vendors/:id`
- **Purchase orders:** `GET /inventory/purchase-orders`, `GET /:id`, `POST` (auto `PO-YYYY-000001`), `PATCH /:id/receive` (stocks in every line + logs transactions), `PATCH /:id/cancel`

## Billing & Payments
View/Manage: `ADMIN`, `ACCOUNTANT`, `RECEPTIONIST`.
- **GET** `/billing/invoices?page&limit&status&patient`, `GET /billing/stats`, `GET /billing/invoices/:id` (with payments)
- **GET** `/billing/suggestions/:patientId` — billable lines auto-pulled from the patient's lab / radiology / pharmacy
- **POST** `/billing/invoices` — auto `INV-YYYY-000001`; computes subtotal, discount (flat), tax (%), grand total
- **PUT** `/billing/invoices/:id` — edit items (blocked once PAID), or set REFUNDED / CANCELLED
- **POST** `/billing/invoices/:id/payments` — record a payment (auto `RCPT-YYYY-000001`); updates paid/due and status (PENDING→PARTIAL→PAID); blocks overpayment

## Insurance
`ADMIN`, `ACCOUNTANT`.
- **GET** `/insurance/claims?…`, `GET /insurance/stats`, `GET /insurance/claims/:id` (with history)
- **POST** `/insurance/claims` — auto `CLM-YYYY-000001` (policy prefilled from the patient)
- **PUT** `/insurance/claims/:id` — edit (draft only)
- **PATCH** `/insurance/claims/:id/status` — DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED (needs approvedAmount) → SETTLED; **settling posts an INSURANCE payment to the linked invoice**

## Operation Theatre  (`ADMIN`, `OT_STAFF`, `DOCTOR`, `NURSE`)
- **Theatres:** `GET/POST /ot/theatres`, `PUT/DELETE /ot/theatres/:id`
- **Surgeries:** `GET /ot/surgeries`, `GET /ot/stats`, `POST` (auto `OT-YYYY-000001`), `PUT /ot/surgeries/:id`, `PATCH /ot/surgeries/:id/status` (SCHEDULED → IN_PROGRESS → COMPLETED)

## Blood Bank  (`ADMIN`, `LAB_TECHNICIAN`; view: + `DOCTOR`, `NURSE`)
- **Donors:** `GET/POST /blood-bank/donors`, `PUT/DELETE …`
- **Units:** `GET /blood-bank/units`, `GET /blood-bank/stock` (by group + component), `POST /blood-bank/units` (collect, auto `BU-YYYY-000001`), `PATCH /units/:id/issue`, `PATCH /units/:id/discard`

## HR  (`ADMIN`, `HR`)
- **Employees:** `GET/POST /hr/employees` (auto `EMP-000001`), `PUT/DELETE …`
- **Attendance:** `GET /hr/attendance?date=`, `POST /hr/attendance` (upsert per day)
- **Leaves:** `GET/POST /hr/leaves`, `PATCH /hr/leaves/:id/status` (APPROVED/REJECTED)

## Ambulance  (`ADMIN`, `RECEPTIONIST`; view: + `NURSE`)
- **Fleet:** `GET/POST /ambulance`, `PUT/DELETE …`
- **Trips:** `GET /ambulance/trips`, `POST /ambulance/trips` (auto `AMB-YYYY-000001`, marks vehicle ON_TRIP), `PATCH /ambulance/trips/:id/status` (frees vehicle)

## Notifications  (any authenticated user)
- `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`
- Created automatically on triggers (new appointment → ADMIN, new invoice → ACCOUNTANT); admins see all.

## Audit Logs  (`ADMIN`)
- `GET /audit-logs?page&limit&module&action&search` — auto-captured on login, patient CRUD, invoice, payment.

> **V1 complete.** ICU is handled via the `ICU` ward type + IPD.
