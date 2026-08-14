// Permission catalogue for the dynamic RBAC editor.
// Keys are `<module>:<action>` strings stored on Role.permissions.
//
// NOTE: Route-level enforcement is still primarily role-based (the existing
// authorize(...roles) guards). These permissions are managed + surfaced to the
// client (via /auth/me) so the UI can gate features, and provide the data model
// for finer-grained enforcement to be switched on module-by-module.
export const PERMISSION_MODULES = [
  { key: 'patients', label: 'Patients' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'opd', label: 'OPD' },
  { key: 'ipd', label: 'IPD' },
  { key: 'laboratory', label: 'Laboratory' },
  { key: 'radiology', label: 'Radiology' },
  { key: 'pharmacy', label: 'Pharmacy' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'billing', label: 'Billing' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'reports', label: 'Reports' },
  { key: 'hr', label: 'HR' },
  { key: 'users', label: 'Users' },
  { key: 'settings', label: 'Settings' },
];

export const PERMISSION_ACTIONS = ['view', 'manage'];

export const PERMISSION_CATALOG = PERMISSION_MODULES.flatMap((m) =>
  PERMISSION_ACTIONS.map((a) => ({ key: `${m.key}:${a}`, module: m.key, action: a, label: `${m.label} — ${a}` }))
);

export const ALL_PERMISSION_KEYS = PERMISSION_CATALOG.map((p) => p.key);
