# HMS — CTO Roadmap & Enhancement Tracker

Full-codebase review (176 backend files, 99 frontend pages, ~12.6k LOC backend,
106 tests) se nikli prioritised list. Ye [ENHANCEMENTS.md](./ENHANCEMENTS.md) ka
successor hai — wahan ke pending items yahan carry-forward ho gaye hain (`↩` se
mark kiye gaye).

Status: ⬜ pending · 🔨 in progress · ✅ done

**Progress: 37 / 66 done · test suite 106 → 414, all passing · lint 0 errors.**

| Block | Status |
|---|---|
| 🔴 P0-A — Revenue Leakage (#1–6) | ✅ **COMPLETE** |
| 🔴 P0-B — Data Integrity (#7–13) | ✅ **COMPLETE** |
| 🔴 P0-C — Security & Compliance (#14–20) | ✅ **COMPLETE** |
| 🟠 P1 — Scale Wall (#21–29) | ✅ 8 / 9 (#26 React Query pending) |
| 🟠 P1 — Ops & Quality (#30–36) | 🔨 4 / 7 (#33 partly, #34–35 pending) |
| 🔴 Missing Modules — Must-have (#37–46) | 🔨 6 / 10 — #37 Casualty, #39 Tariffs, #41 GST, #42 MAR, #43 Notes, #44 Vitals |
| 🟠 Missing Modules — Strategic (#47–53) | ⬜ not started |
| 🟡 P2 — Growth (#54–66) | ⬜ not started |

> **Sab P0 khatam ho gaya.** Jo bacha hai wo ya to *new product modules* hain
> (Emergency/Triage, ABDM, FHIR, PACS, LIS — har ek apne aap me multi-week
> project) ya polish. Bug aur risk wala kaam poora ho chuka hai.

> **Money representation.** Sabse bade change ka short version: ledger ab integer
> paise me store hota hai, par API contract rupees hi rehta hai. Conversion sirf
> do jagah hoti hai — `zodPaise()` validators pe (inbound) aur `toJSON` transform
> pe (outbound). Iska matlab **service layer ke andar sab kuch paise hai, bina
> exception ke**. Do jagah ye transform nahi chalta aur manual conversion zaroori
> hai: **aggregation results** (`$sum` schema ko bypass karta hai) aur **`.lean()`
> queries**. Naya money-touching code likhte waqt yahi ek cheez dhyan rakhni hai.

**Baseline verdict:** engineering quality high hai — concurrency handling
(atomic `findOneAndUpdate` + compensating-undo) aur multi-tenancy design
production-grade hain. Teen cheezein sab features se pehle aati hain:
system **paisa leak kar raha hai**, **float pe accounting kar raha hai**, aur
**RBAC ka jhooth bol raha hai**.

---

## 🔴 P0-A — Revenue Leakage

Sabse bada *functional* hole. Koi bhi hospital pehle hafte me pakad lega.

| # | Item | Detail | Files | Status |
|---|------|--------|-------|--------|
| 1 | IPD bed charges kabhi bill nahi hote | Ab `bedStays[]` occupancy segments record hote hain; charge **per-night midnight census** se, har raat us bed ke rate pe jismein patient tha | `models/IPDAdmission.js`, `services/bedCharges.js` (naya), `services/ipdService.js` | ✅ |
| 2 | Surgery charges bill me nahi jaate | `COMPLETED` surgeries ab suggestions me | `services/billingService.js` | ✅ |
| 3 | Blood unit `chargeAmount` kahin nahi jaata | `ISSUED` units ab suggestions me | `services/billingService.js` | ✅ |
| 4 | Ambulance trip `charges` bill me nahi | `COMPLETED` trips ab suggestions me | `services/billingService.js` | ✅ |
| 5 | Doctor consultation fee auto-post nahi hoti | OPD visits ab doctor ki `consultationFee` pe suggest hote hain | `services/billingService.js` | ✅ |
| 6 | `billingSuggestions()` sirf Lab/Rad/Pharmacy cover karta hai | 3 sources → **8**. `sourceKey` add kiya per-night dedup ke liye | `models/Invoice.js`, `services/billingService.js`, `pages/billing/NewInvoice.jsx` | ✅ |

> **Approach jo liya:** naya push-model banane ke bajaye existing **pull model**
> extend kiya — `billingSuggestions()` unbilled lines suggest karta hai, dedup
> `sourceId` se. Isse koi naya state ya reconciliation problem nahi aayi.
>
> **Bed charges ka rule:** har *raat* jo bed occupy hui (midnight census), us
> bed ke rate pe jismein patient us waqt tha. Ye hospital ki standard practice
> hai, aur transfers ko sahi handle karta hai — dopahar ko ward badalna ek din
> ko do chargeable din nahi banata. Same-day admission+discharge = 1 din.
>
> **Per-night dedup:** bed ek saath bill nahi hota, isliye `sourceId` (jo poore
> document ko bill hua maan leta hai) kaafi nahi tha. Naya `sourceKey`
> (`IPD_BED:<admission>:<date>`) har raat alag identify karta hai — to mid-stay
> interim bill baaki stay ko block nahi karta.
>
> Migration: `npm run migrate:bedstays` (purani admissions ke liye; re-run safe).

---

## 🔴 P0-B — Data Integrity

| # | Item | Detail | Files | Status |
|---|------|--------|-------|--------|
| 7 ↩ | **Money as integer paise** | Invoice/Payment/Payslip/InsuranceClaim ab integer paise me. `EPSILON` aur har `$round` gaya — comparisons ab exact hain. Wire format rupees hi hai: `zodPaise` validators pe inbound, `toJSON` transform outbound. Migration: `npm run migrate:paise` | `utils/money.js` (naya), 4 models, 5 services, validators, `pdf.js`, `seed/migrateMoneyToPaise.js`, `tests/money.test.js` | ✅ |
| 8 | OT theatre double-booking race | Ab 5-min slot buckets + partial-unique index `{theatre, slots}`, Appointment jaisa. Service check bhi usi bucket logic pe, to dono layers kabhi disagree nahi karenge | `models/Surgery.js`, `services/otService.js`, `tests/ot.test.js` | ✅ |
| 9 | Blood unit double-issue race | `reserve`/`unreserve`/`issue`/`discard` ab atomic `findOneAndUpdate`, precondition query me (claimBed idiom) | `services/bloodBankService.js`, `tests/bloodbank.test.js` | ✅ |
| 10 | Insurance settle pe koi compensation nahi | Payment fail hone pe claim wapas `APPROVED`, history me reversal note. Retry legal transition hai | `services/insuranceService.js` | ✅ |
| 11 | `patient.insurance` dead-field bug | Ab `insurances` array padhta hai; policy insurer se match hoke aur in-date preference se chunti hai | `services/insuranceService.js` | ✅ |
| 12 | `adjustStock` fake batch banata hai | Positive delta ab batch number maangta hai (naya batch ho to expiry bhi). Koi invented expiry nahi | `services/pharmacyService.js`, `validators/pharmacyValidator.js`, `pages/pharmacy/AdjustStockModal.jsx` | ✅ |
| 13 | `sweepExpired()` read path pe `updateMany` | Sweep scheduler pe move; reads ab expiry date se filter karte hain, to sweeps ke beech bhi sahi | `services/bloodBankService.js`, `services/scheduler.js` | ✅ |

---

## 🔴 P0-C — Security & Compliance

| # | Item | Detail | Files | Status |
|---|------|--------|-------|--------|
| 14 ↩ | **Dynamic RBAC enforce nahi hota** | Ab `requirePermission` har route pe. 195 hardcoded role-arrays gaye. Defaults purane role-lists se derive kiye (backward compatible), `tests/rbac.test.js` matrix pin karta hai. Frontend bhi permissions pe gate karta hai | `config/permissions.js`, `middleware/rbac.js`, 28 route files, `App.jsx`, `navigation.js`, `tests/rbac.test.js` | ✅ |
| 15 ↩ | **PHI read logging zero** | Router-level `auditTrail(module, {phi:true})` — PHI reads ab log hote hain | `middleware/auditTrail.js`, saare routes | ✅ |
| 16 ↩ | Audit coverage 13/28 controllers | Audit ab infrastructure hai, controller ki yaad-daasht nahi. Naya route by-default audited | `middleware/auditTrail.js` | ✅ |
| 17 | AuditLog immutability sirf comment me | Update/delete hooks refuse karte hain; TTL retention (`AUDIT_RETENTION_DAYS`, default ~7 saal); userRole + requestId add | `models/AuditLog.js`, `services/auditRetention.js` | ✅ |
| 18 ↩ | Refresh tokens + revocation | Access token 15m; refresh session DB row (rotating, revocable, httpOnly cookie). Logout/password-change sab sessions revoke karte hain. Replay detect hone pe sab sessions band | `models/Session.js`, `services/sessionService.js`, `services/api.js`, `tests/session.test.js` | ✅ |
| 19 | PHI encryption at rest | Free-text clinical notes AES-256-GCM se encrypted (opt-in `PHI_ENCRYPTION_KEY`). Searchable identifiers deliberately NAHI — wo storage-level encryption ka kaam hai (reason file me) | `utils/encryption.js`, `Patient.js`, `OPDVisit.js`, `IPDAdmission.js` | ✅ |
| 20 ↩ | Infra: Mongo auth, nginx security headers | Mongo ab `--auth` + keyFile pe; nginx pe CSP/HSTS/frame-options/permissions-policy + asset caching | `docker-compose.yml`, `nginx.conf`, `scripts/mongo-keyfile.sh` | ✅ |

---

## 🟠 P1 — Scale Wall

Abhi seed data pe theek lagta hai. Real load pe pehla din hi problem.

| # | Item | Detail | Files | Status |
|---|------|--------|-------|--------|
| 21 ↩ | **Search rewrite — unbounded `$in`** | Shared capped helper (500 max), prefix-anchored regex (index use kar sakta hai). 6 services converted | `services/searchFilters.js`, 6 services, `tests/search.test.js` | ✅ |
| 22 ↩ | **Indexes — 45 me se 31 models pe koi nahi** | 30 models pe compound indexes, ESR order me, ek jagah declare. Boot pe har tenant me build hote hain | `models/indexes.js`, `services/indexService.js` | ✅ |
| 23 ↩ | Redis-backed rate limiting | Optional `REDIS_URL` — set ho to shared, warna per-process + boot pe loud warning | `config/rateLimitStore.js` | ✅ |
| 24 ↩ | Scheduler leader-lock / BullMQ | Control-DB pe lease (atomic claim + expiry). Ab N instances = 1 reminder, N nahi | `services/jobLock.js`, `models/JobLock.js` | ✅ |
| 25 ↩ | Frontend code-splitting | 37 pages lazy. Initial bundle **1293 kB → 339 kB** | `App.jsx` | ✅ |
| 26 | React Query / SWR | 68 pages hand-rolled `useEffect` — no cache, dedupe, retry; stale data | `frontend/src/pages/*` | ⬜ |
| 27 ↩ | Dashboard 11 calls → 1 | Ek endpoint, sections individually permission-gated (graceful degradation preserved) | `reportService.dashboardSummary`, `Dashboard.jsx`, `tests/dashboard.test.js` | ✅ |
| 28 | Export streaming | `limit: 100000` in-memory — 50k rows pe OOM | `services/hrService.js`, `utils/exporters.js` | ⬜ |
| 29 | HR payroll N+1 | Month ke saare payslips ek query me, loop ke andar findOne nahi | `services/hrService.js` | ✅ |

---

## 🟠 P1 — Ops & Quality

| # | Item | Detail | Files | Status |
|---|------|--------|-------|--------|
| 30 ↩ | **ESLint + Prettier** | Root pe flat config (backend+frontend), CI me apna lint job. 0 errors. Noise deliberately off, reason ke saath | `eslint.config.js`, `package.json`, `ci.yml` | ✅ |
| 31 | Sentry + metrics/APM | Sentry + self-hosted `ErrorLog` — fingerprint se grouping (2000 hits = 1 row), affected-user count, release tracking, TTL retention | `config/sentry.js`, `services/errorTracking.js`, `models/ErrorLog.js` | ✅ |
| 32 ↩ | ErrorBoundary | Render crash pe recoverable screen, white page nahi. Suspense ke saath routes ke around | `components/ErrorBoundary.jsx` | ✅ |
| 33 ↩ | Test coverage expansion | 106 tests, par OT/BloodBank/HR/Ambulance/Radiology uncovered | `backend/tests/` | ⬜ |
| 34 | E2E tests (Playwright) | Critical flows: admit→discharge→bill, dispense, claim settle | new | ⬜ |
| 35 ↩ | Accessibility audit | Keyboard rows, aria, focus trap | UI components | ⬜ |
| 36 | Notification scoping | Admins ko ab unfiltered `{}` nahi milta — sabko apne/role ke/broadcast notifications | `services/notificationService.js` | ✅ |

---

## 🔴 Missing Modules — Must-have

Bina inke real hospital deploy nahi karega.

| # | Module | Kyun | Status |
|---|--------|------|--------|
| 37 | **Emergency / Casualty + Triage** | 5-level acuity scale; queue **acuity se order** hoti hai arrival se nahi; unidentified patient ka chart (alias + baad me identify); door-to-doctor compliance per level; MLC register + police intimation; ADMITTED disposition IPD admission banata hai (fail ho to visit reopen) | `models/EmergencyVisit.js`, `services/emergencyService.js`, `pages/emergency/*`, `tests/emergency.test.js` | ✅ |
| 38 | **OPD Queue / Token management** | + waiting display board | ⬜ |
| 39 | **Tariff / Rate plans** | Ek service ke multiple payer-rates. Plan me negotiated rate ya blanket `%` adjustment; patient pe plan; `billingSuggestions` ab plan ke through price karta hai | `models/TariffPlan.js`, `services/tariffService.js`, `pages/tariffs/TariffPlans.jsx`, `tests/tariff.test.js` | ✅ |
| 40 | **IPD Advance / Deposit** | Hospitals pehle deposit lete hain | ⬜ |
| 41 | **GST-compliant invoicing** | Per-line tax treatment (EXEMPT/NIL/TAXABLE) + HSN/SAC, CGST/SGST vs IGST split, place of supply, customer GSTIN. Discount lines pe apportion hoke tax lagta hai | `config/gst.js`, `models/Invoice.js`, `services/billingService.js`, `utils/pdf.js`, `tests/gst.test.js` | ✅ |
| 42 | **MAR / eMAR** | Prescribe → schedule → administer. Frequency ab structured hai (OD/BD/TDS/Q6H…) to due-times generate hote hain. `(order, scheduledFor)` pe unique index — same dose do baar sign nahi ho sakti. GIVEN ke alawa har outcome pe reason mandatory. Prescribe aur administer alag permissions | `models/ClinicalRecord.js`, `services/clinicalService.js`, `pages/clinical/MedicationChart.jsx` | ✅ |
| 43 | **Doctor progress notes (IPD)** | Typed notes (PROGRESS/NURSING/PROCEDURE/HANDOVER/CONSULTATION/DISCHARGE), author + role snapshot. Signed note edit nahi hoti — correction addendum banta hai | `models/ClinicalRecord.js`, `pages/clinical/ClinicalNotes.jsx` | ✅ |
| 44 | **Vitals time-series** | Ab har reading alag row. BP do numbers me (plot ho sake). NEWS2 auto-compute + ≥7 pe alert. Missing reading zero nahi — chart me gap dikhta hai | `models/ClinicalRecord.js`, `pages/clinical/VitalsChart.jsx` | ✅ |
| 45 | **Consent forms + e-signature** | | ⬜ |
| 46 | **Death / Birth / MLC registers** | Statutory | ⬜ |

---

## 🟠 Missing Modules — Strategic (moat + compliance)

| # | Module | Kyun | Status |
|---|--------|------|--------|
| 47 | **ABDM / ABHA integration** | India me tezi se mandatory ho raha hai | ⬜ |
| 48 | **HL7 / FHIR** | Bina iske koi lab analyzer, PACS ya govt system integrate nahi hoga | ⬜ |
| 49 | **DICOM / PACS** | Radiology me images hi nahi, sirf text findings | ⬜ |
| 50 | **LIS analyzer interface** | Lab results abhi manually type hote hain | ⬜ |
| 51 | **Barcode / QR** | Sample tracking, patient wristband, medicine | ⬜ |
| 52 | **Package / Scheme billing** | Maternity package, dialysis package | ⬜ |
| 53 | Drug-drug interaction | Abhi sirf naive substring allergy match (`name.includes(allergy)`) | ⬜ |

---

## 🟡 P2 — Growth

| # | Item | Status |
|---|------|--------|
| 54 | Diet & kitchen module | ⬜ |
| 55 | Housekeeping module | ⬜ |
| 56 | Biomedical asset / maintenance register | ⬜ |
| 57 | Referral management + referring-doctor commission | ⬜ |
| 58 | Doctor payout / revenue-share | ⬜ |
| 59 | Duty roster & shift scheduling (HR me attendance hai, rostering nahi) | ⬜ |
| 60 | Appointment waitlist + slot capacity + auto-fill on cancel | ⬜ |
| 61 | GST / day-book / TPA-ageing reports | ⬜ |
| 62 | Scheduled report emails | ⬜ |
| 63 | Bulk actions (multi-select) on list pages | ⬜ |
| 64 | i18n (Hindi/regional) — patient portal ke liye zaroori | ⬜ |
| 65 | Portal email/OTP verification | ⬜ |
| 66 | Bed-occupancy forecasting, no-show prediction | ⬜ |

---

## 📅 Sequencing

| Sprint | Theme | Items |
|--------|-------|-------|
| **1–2** | **Paisa aur Sach** — revenue + integrity | 1–13 |
| **3–4** | **Scale Wall** | 21–29 |
| **5–6** | **Compliance Gate** | 14–20, 39, 40, 41 |
| **7–9** | **Clinical Credibility** | 37, 38, 42, 43, 44, 45, 46 |
| **10+** | **Moat** | 47–53 |
| *parallel* | Ops & Quality (har sprint me thoda) | 30–36 |

---

## 📊 Module Scorecard (review ke waqt)

| Module | State | Sabse bada gap |
|---|---|---|
| Auth | 🟢 Strong | Refresh token / revocation nahi |
| RBAC | 🔴 Fake | Enforcement zero (#14) |
| Patients | 🟢 Good | Search `$in` (#21) |
| Appointments | 🟢 Best-in-repo | Waitlist / slot capacity nahi |
| OPD | 🟡 OK | Naive allergy match, vitals trend nahi |
| IPD | 🟡 Clinically thin | Bed charges bill nahi (#1), MAR nahi (#42) |
| Lab | 🟡 OK | Koi LIS interface / sample barcode nahi |
| Radiology | 🟡 OK | DICOM/PACS bilkul nahi (#49) |
| Pharmacy | 🟢 Strong (FEFO + batch) | `adjustStock` fake batch (#12) |
| Inventory | 🟢 Good (transactions) | — |
| Billing | 🟡 Correct par nazuk | Money float (#7) |
| Insurance | 🟡 | Dead field bug (#11), no compensation (#10) |
| OT | 🔴 Race | Theatre double-booking (#8) |
| Blood Bank | 🔴 Race | Unit double-issue (#9) |
| HR | 🟡 | N+1 payroll (#29), roster nahi (#59) |
| Ambulance | 🟢 OK | Charges bill me nahi (#4) |
| Reports | 🟡 | Dashboard 11 calls (#27), GST/day-book nahi (#61) |
| Audit | 🔴 Incomplete | PHI read logging zero (#15) |
| Portal | 🟢 Good | Email/OTP verification nahi (#65) |
| Notifications | 🟡 | Admin scoping (#36) |
