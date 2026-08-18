// Compound indexes for the queries the application actually runs.
//
// Most models carried none. That is invisible on seed data and fatal on real
// data: every list screen filters on status and sorts by a date, and with
// neither indexed MongoDB reads the whole collection and sorts it in memory —
// which it refuses outright past 32 MB.
//
// They live here rather than beside each schema so the whole access pattern of
// the system can be read in one place, and so adding one is a deliberate act
// rather than a line lost in a model file. Single-field indexes declared inline
// on the schemas (uhid, invoiceNo, …) stay where they are.
//
// Keyed by MODEL NAME, not by the exported model: those exports are per-tenant
// proxies that resolve against the current request's connection, so touching
// one outside a request has nothing to resolve to. Indexes belong to the
// schema, which is shared across tenants — that is what the registry holds.
import './registry-imports.js'; // side-effect: every schema registers itself
import { schemaFor } from '../db/registry.js';
import { currentConnection } from '../db/tenantContext.js';

// modelName: [index spec, options?][]
//
// Field order follows the ESR rule — Equality first, then Sort, then Range —
// because that is the order MongoDB can actually use a compound index in.
const PLAN = {
  // The list screen filters on status and sorts newest-first; the name/phone
  // lookups back the search box and the merge-duplicates screen.
  Patient: [[{ status: 1, createdAt: -1 }], [{ firstName: 1, lastName: 1 }], [{ phone: 1, status: 1 }]],

  // "Today's list" per doctor, and a patient's own history.
  Appointment: [
    [{ doctor: 1, date: -1, time: -1 }], [{ patient: 1, date: -1 }], [{ status: 1, date: -1 }],
    // The reminder job scans exactly this shape once an hour.
    [{ status: 1, reminderSent: 1, date: 1 }],
  ],

  OPDVisit: [[{ status: 1, visitDate: -1 }], [{ patient: 1, visitDate: -1 }], [{ doctor: 1, visitDate: -1 }], [{ appointment: 1 }]],

  IPDAdmission: [
    [{ status: 1, admissionDate: -1 }], [{ patient: 1, admissionDate: -1 }],
    [{ admittingDoctor: 1, admissionDate: -1 }], [{ bed: 1, status: 1 }],
  ],

  LabOrder: [[{ status: 1, createdAt: -1 }], [{ patient: 1, createdAt: -1 }], [{ doctor: 1, createdAt: -1 }], [{ opdVisit: 1 }], [{ 'items.test': 1 }]],
  LabTest: [[{ status: 1, category: 1, name: 1 }]],

  RadiologyOrder: [[{ status: 1, createdAt: -1 }], [{ patient: 1, createdAt: -1 }], [{ doctor: 1, createdAt: -1 }]],
  RadiologyTest: [[{ status: 1, modality: 1, name: 1 }]],

  // The outstanding-invoices screen, a patient's ledger, and the revenue
  // aggregations, which all match on status and range over createdAt.
  Invoice: [
    [{ status: 1, createdAt: -1 }], [{ patient: 1, createdAt: -1 }],
    // Suggested-charge de-duplication looks up both of these.
    [{ 'items.sourceId': 1 }], [{ 'items.sourceKey': 1 }],
  ],
  Payment: [[{ invoice: 1, createdAt: -1 }], [{ patient: 1, createdAt: -1 }], [{ createdAt: -1 }]],
  InsuranceClaim: [[{ status: 1, createdAt: -1 }], [{ patient: 1, createdAt: -1 }], [{ invoice: 1 }]],

  // The low-stock screen, and FEFO batch selection on every dispense.
  Medicine: [[{ status: 1, name: 1 }], [{ genericName: 1 }]],
  MedicineBatch: [[{ medicine: 1, expiryDate: 1 }], [{ expiryDate: 1, quantity: 1 }]],
  MedicineDispense: [[{ patient: 1, createdAt: -1 }], [{ createdAt: -1 }], [{ opdVisit: 1 }], [{ 'items.medicine': 1 }]],

  InventoryItem: [[{ status: 1, name: 1 }], [{ category: 1, status: 1 }]],
  InventoryItemBatch: [[{ item: 1, expiryDate: 1 }]],
  StockTransaction: [[{ item: 1, createdAt: -1 }], [{ createdAt: -1 }]],
  PurchaseOrder: [[{ status: 1, createdAt: -1 }], [{ vendor: 1, createdAt: -1 }]],

  Surgery: [
    [{ status: 1, scheduledDate: -1 }], [{ patient: 1, scheduledDate: -1 }],
    [{ surgeon: 1, scheduledDate: -1 }], [{ theatre: 1, scheduledDate: -1 }],
  ],

  // Stock is grouped by group+component and always filtered on "still in
  // date", which is a range — hence expiry last.
  BloodUnit: [[{ status: 1, bloodGroup: 1, expiryDate: 1 }], [{ issuedTo: 1, status: 1 }], [{ component: 1, status: 1 }]],
  BloodDonor: [[{ bloodGroup: 1, name: 1 }]],

  Employee: [[{ status: 1, name: 1 }], [{ department: 1, status: 1 }]],
  // {employee, date} is already covered by the unique index on the schema —
  // adding it again here would just be a second copy of the same tree.
  Attendance: [[{ date: -1 }], [{ status: 1, date: -1 }]],
  Leave: [[{ status: 1, createdAt: -1 }], [{ employee: 1, fromDate: -1 }]],
  Payslip: [[{ year: -1, month: -1 }], [{ status: 1, createdAt: -1 }]],

  AmbulanceTrip: [[{ status: 1, createdAt: -1 }], [{ ambulance: 1, createdAt: -1 }], [{ patient: 1, createdAt: -1 }]],

  // The bed map reads every bed in a ward with its current status.
  Bed: [[{ ward: 1, status: 1 }], [{ room: 1, status: 1 }], [{ status: 1 }]],
  // Room needs nothing here: {ward, roomNo} is already declared unique on the
  // schema, and re-declaring the same key pattern with different options is an
  // error rather than a no-op.

  // Doctors sign in as users; the dashboard resolves one from the other.
  Doctor: [[{ status: 1, firstName: 1 }], [{ department: 1, status: 1 }], [{ user: 1 }]],

  User: [[{ role: 1, status: 1 }], [{ patient: 1 }]],

  // The bell polls unread counts constantly.
  Notification: [[{ user: 1, read: 1, createdAt: -1 }], [{ role: 1, read: 1, createdAt: -1 }]],

  PatientDocument: [[{ patient: 1, createdAt: -1 }]],
  ClaimDocument: [[{ claim: 1, createdAt: -1 }]],
};

export const INDEXED_MODELS = Object.keys(PLAN);

// Declare every index on its schema. Runs at import time, before any connection
// exists, so each tenant database picks them up as it is created.
let declared = false;
export function declareIndexes() {
  if (declared) return;
  for (const [name, specs] of Object.entries(PLAN)) {
    const schema = schemaFor(name);
    for (const [spec, options = {}] of specs) {
      schema.index(spec, { background: true, ...options });
    }
  }
  declared = true;
}

// Build them in the current tenant's database.
//
// Mongoose's autoIndex would do this per model on first use, which on a
// multi-tenant deployment means an index build triggered by whichever request
// happens to touch a collection first. Doing it explicitly at boot keeps that
// cost off the request path.
export async function buildIndexes() {
  declareIndexes();
  const conn = currentConnection();

  const results = await Promise.allSettled(
    INDEXED_MODELS.map((name) => {
      const model = conn.models[name] || conn.model(name, schemaFor(name));
      return model.syncIndexes();
    })
  );

  const failed = results
    .map((r, i) => (r.status === 'rejected' ? INDEXED_MODELS[i] : null))
    .filter(Boolean);
  return { total: INDEXED_MODELS.length, failed };
}
