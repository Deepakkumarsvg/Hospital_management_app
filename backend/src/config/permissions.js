// The permission catalogue — and, from here on, the thing routes are actually
// guarded by.
//
// This used to be a decorative list: admins could edit a permission matrix in
// the UI and nothing whatsoever changed, because every route was gated on a
// hard-coded array of role names. The matrix and the enforcement now agree,
// because they are the same data.
//
// Actions are per-module rather than a flat view/manage pair, because the old
// role arrays drew finer lines than that and collapsing them would quietly
// hand people access they never had — a doctor may ORDER a lab test, a
// technician may PROCESS one, and neither may do the other's half.

export const PERMISSION_MODULES = [
  { key: 'patients', label: 'Patients', actions: ['view', 'edit', 'delete'] },
  { key: 'appointments', label: 'Appointments', actions: ['view', 'book', 'status', 'delete'] },
  { key: 'opd', label: 'OPD', actions: ['view', 'edit', 'delete'] },
  { key: 'ipd', label: 'IPD', actions: ['view', 'admit', 'nurse'] },
  // Casualty. Registering an arrival, assigning an acuity, treating and
  // handling a medico-legal case are four different jobs done by four
  // different people, so they are four permissions rather than one.
  { key: 'emergency', label: 'Emergency / Casualty', actions: ['view', 'register', 'triage', 'treat', 'mlc'] },
  // The inpatient chart. Prescribing and administering are separate on
  // purpose: a drug chart only makes anyone safer if the person who writes the
  // order and the person who gives the dose are two different people.
  { key: 'clinical', label: 'Clinical Record', actions: ['view', 'vitals', 'note', 'prescribe', 'administer'] },
  // The OPD queue. Issuing a token is the front desk; calling and running the
  // room is whoever is working it — a different person at a different desk.
  { key: 'queue', label: 'OPD Queue', actions: ['view', 'issue', 'call'] },
  // Advances. Handing money back is the reverse of taking it, so it sits with
  // whoever is trusted to reverse a payment rather than with everyone who can
  // take one.
  { key: 'deposits', label: 'Advances / Deposits', actions: ['view', 'manage', 'refund'] },
  { key: 'laboratory', label: 'Laboratory', actions: ['view', 'order', 'process', 'verify', 'manage'] },
  { key: 'radiology', label: 'Radiology', actions: ['view', 'order', 'process', 'manage'] },
  { key: 'pharmacy', label: 'Pharmacy', actions: ['view', 'manage', 'delete'] },
  { key: 'inventory', label: 'Inventory', actions: ['view', 'manage', 'delete'] },
  { key: 'billing', label: 'Billing', actions: ['view', 'manage', 'reverse'] },
  { key: 'insurance', label: 'Insurance', actions: ['view', 'manage'] },
  { key: 'reports', label: 'Reports', actions: ['view'] },
  { key: 'ot', label: 'Operation Theatre', actions: ['view', 'manage', 'admin'] },
  { key: 'bloodbank', label: 'Blood Bank', actions: ['view', 'manage', 'delete'] },
  { key: 'hr', label: 'HR & Payroll', actions: ['view', 'manage', 'delete'] },
  { key: 'ambulance', label: 'Ambulance', actions: ['view', 'manage', 'admin'] },
  { key: 'facilities', label: 'Wards / Rooms / Beds', actions: ['view', 'manage', 'bedstatus'] },
  { key: 'doctors', label: 'Doctors', actions: ['view', 'manage'] },
  { key: 'departments', label: 'Departments', actions: ['view', 'manage'] },
  { key: 'users', label: 'Users', actions: ['manage'] },
  { key: 'roles', label: 'Roles & Permissions', actions: ['manage'] },
  { key: 'settings', label: 'Settings', actions: ['view', 'manage'] },
  { key: 'audit', label: 'Audit Log', actions: ['view'] },
  // Stack traces and the request context around them. Separate from audit:view
  // because they answer opposite questions — the audit log is who did what, and
  // this is what the software got wrong — and because a hospital may well want
  // its IT contact reading crash reports without also handing them the clinical
  // access trail.
  { key: 'errors', label: 'Error Tracking', actions: ['view', 'manage'] },
  // Price lists decide what every payer is charged, so editing them is a
  // commercial act rather than a clinical one — it sits with whoever owns
  // billing, not with whoever ordered the test.
  { key: 'tariffs', label: 'Tariff Plans', actions: ['view', 'manage'] },
  { key: 'ops', label: 'Operations', actions: ['admin'] },
];

export const PERMISSION_CATALOG = PERMISSION_MODULES.flatMap((m) =>
  m.actions.map((a) => ({
    key: `${m.key}:${a}`,
    module: m.key,
    action: a,
    label: `${m.label} — ${a}`,
  }))
);

export const ALL_PERMISSION_KEYS = PERMISSION_CATALOG.map((p) => p.key);

// Every action name used anywhere, in first-seen order.
//
// Actions are declared per module now, so this is derived rather than
// maintained — a module gaining an action can't leave this list stale. It
// exists because the permission-catalog endpoint still hands the client a flat
// list to build matrix columns from; the client is what should eventually read
// each module's own actions instead.
export const PERMISSION_ACTIONS = [...new Set(PERMISSION_MODULES.flatMap((m) => m.actions))];

const only = (moduleKey, ...actions) => actions.map((a) => `${moduleKey}:${a}`);

// What each role can do out of the box.
//
// This is a faithful transcription of the role arrays the routes used to carry,
// so switching enforcement over changed nobody's access. tests/rbac.test.js
// pins that down endpoint by endpoint — it is the spec for this table, and the
// reason a change here can be made with confidence.
//
// SUPER_ADMIN is deliberately absent: it bypasses permission checks entirely
// rather than being granted everything, so a new module is never accidentally
// out of its reach.
export const DEFAULT_ROLE_PERMISSIONS = {
  // A hospital admin runs the hospital, so they hold every permission in it.
  // What they still cannot reach is the cross-hospital tenant console, which
  // is guarded by SUPER_ADMIN identity rather than by any permission.
  ADMIN: [...ALL_PERMISSION_KEYS],

  DOCTOR: [
    ...only('patients', 'view'),
    ...only('appointments', 'view', 'status'),
    ...only('opd', 'view', 'edit'),
    ...only('ipd', 'view', 'admit', 'nurse'),
    ...only('emergency', 'view', 'register', 'triage', 'treat', 'mlc'),
    ...only('clinical', 'view', 'vitals', 'note', 'prescribe'),
    ...only('queue', 'view', 'call'),
    ...only('laboratory', 'view', 'order', 'verify'),
    ...only('radiology', 'view', 'order'),
    ...only('pharmacy', 'view'),
    ...only('ot', 'view', 'manage'),
    ...only('bloodbank', 'view'),
    ...only('facilities', 'view'),
    ...only('doctors', 'view'),
    ...only('departments', 'view'),
  ],

  NURSE: [
    ...only('patients', 'view'),
    ...only('appointments', 'view', 'status'),
    ...only('opd', 'view', 'edit'),
    ...only('ipd', 'view', 'nurse'),
    ...only('emergency', 'view', 'register', 'triage'),
    ...only('clinical', 'view', 'vitals', 'note', 'administer'),
    ...only('queue', 'view', 'issue', 'call'),
    ...only('laboratory', 'view'),
    ...only('radiology', 'view'),
    ...only('pharmacy', 'view'),
    ...only('ot', 'view'),
    ...only('bloodbank', 'view'),
    ...only('ambulance', 'view'),
    ...only('facilities', 'view', 'bedstatus'),
    ...only('doctors', 'view'),
    ...only('departments', 'view'),
  ],

  RECEPTIONIST: [
    ...only('patients', 'view', 'edit'),
    ...only('appointments', 'view', 'book', 'status'),
    ...only('opd', 'view'),
    ...only('ipd', 'view', 'admit'),
    ...only('emergency', 'view', 'register'),
    ...only('laboratory', 'view'),
    ...only('radiology', 'view'),
    ...only('billing', 'view', 'manage'),
    ...only('queue', 'view', 'issue', 'call'),
    ...only('deposits', 'view', 'manage'),
    ...only('tariffs', 'view'),
    ...only('ambulance', 'view', 'manage'),
    ...only('facilities', 'view'),
    ...only('doctors', 'view'),
    ...only('departments', 'view'),
  ],

  LAB_TECHNICIAN: [
    ...only('laboratory', 'view', 'process'),
    ...only('bloodbank', 'view', 'manage'),
  ],

  RADIOLOGIST: [
    ...only('radiology', 'view', 'process'),
  ],

  PHARMACIST: [
    ...only('pharmacy', 'view', 'manage'),
  ],

  ACCOUNTANT: [
    ...only('billing', 'view', 'manage', 'reverse'),
    ...only('deposits', 'view', 'manage', 'refund'),
    ...only('insurance', 'view', 'manage'),
    ...only('reports', 'view'),
    ...only('tariffs', 'view', 'manage'),
  ],

  STORE_MANAGER: [
    ...only('inventory', 'view', 'manage'),
  ],

  OT_STAFF: [
    ...only('ot', 'view', 'manage'),
  ],

  HR: [
    ...only('hr', 'view', 'manage'),
  ],

  // Portal accounts reach nothing in the staff API; their routes are guarded
  // by patient-ownership checks instead.
  PATIENT: [],
};

// The permissions a role has when nobody has customised it.
export const defaultPermissionsFor = (role) => DEFAULT_ROLE_PERMISSIONS[role] || [];
