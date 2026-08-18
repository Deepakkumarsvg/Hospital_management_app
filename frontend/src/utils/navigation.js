import {
  LayoutDashboard, Users, Stethoscope, CalendarDays, ClipboardList,
  BedDouble, FlaskConical, Scan, Pill, Receipt, Boxes, Scissors,
  BarChart3, UserCog, Settings, Building2, ShieldCheck, LayoutGrid, ShieldPlus,
  Droplet, Truck, ScrollText, UserRound, Building, Bug, IndianRupee, Siren,
} from 'lucide-react';

// Full V1+ navigation.
//
// `perm` is the permission that opens the item's page — the same key the server
// guards that route with, so the sidebar shows exactly what the API will serve.
// It used to be a list of role names duplicated from the backend, which meant
// editing the permission matrix left the sidebar stale: a nurse granted
// billing:view could reach /billing by typing the URL but had no link to it.
//
// `perm: null` means "any authenticated account".
// `superAdminOnly` items are gated on identity, not permission — see App.jsx.
export const NAV_ITEMS = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard, perm: null, group: 'Overview' },

  { label: 'Casualty', to: '/emergency', icon: Siren, perm: 'emergency:view', group: 'Patient Care' },
  { label: 'Patients', to: '/patients', icon: Users, perm: 'patients:view', group: 'Patient Care' },
  { label: 'Appointments', to: '/appointments', icon: CalendarDays, perm: 'appointments:view', group: 'Patient Care' },
  { label: 'Doctors', to: '/doctors', icon: Stethoscope, perm: 'doctors:view', group: 'Patient Care' },
  { label: 'Departments', to: '/departments', icon: Building2, perm: 'departments:manage', group: 'Patient Care' },
  { label: 'OPD', to: '/opd', icon: ClipboardList, perm: 'opd:view', group: 'Patient Care' },
  { label: 'IPD', to: '/ipd', icon: BedDouble, perm: 'ipd:view', group: 'Patient Care' },
  { label: 'Beds', to: '/beds', icon: LayoutGrid, perm: 'facilities:view', group: 'Patient Care' },

  { label: 'Laboratory', to: '/laboratory', icon: FlaskConical, perm: 'laboratory:view', group: 'Diagnostics' },
  { label: 'Radiology', to: '/radiology', icon: Scan, perm: 'radiology:view', group: 'Diagnostics' },
  { label: 'Blood Bank', to: '/blood-bank', icon: Droplet, perm: 'bloodbank:view', group: 'Diagnostics' },

  { label: 'Pharmacy', to: '/pharmacy', icon: Pill, perm: 'pharmacy:view', group: 'Pharmacy & Inventory' },
  { label: 'Inventory', to: '/inventory', icon: Boxes, perm: 'inventory:view', group: 'Pharmacy & Inventory' },

  { label: 'OT', to: '/ot', icon: Scissors, perm: 'ot:view', group: 'Operations' },
  { label: 'Ambulance', to: '/ambulance', icon: Truck, perm: 'ambulance:view', group: 'Operations' },
  { label: 'HR', to: '/hr', icon: UserRound, perm: 'hr:view', group: 'Operations' },

  { label: 'Billing', to: '/billing', icon: Receipt, perm: 'billing:view', group: 'Finance' },
  { label: 'Insurance', to: '/insurance', icon: ShieldPlus, perm: 'insurance:view', group: 'Finance' },
  { label: 'Reports', to: '/reports', icon: BarChart3, perm: 'reports:view', group: 'Finance' },
  { label: 'Tariffs', to: '/tariffs', icon: IndianRupee, perm: 'tariffs:view', group: 'Finance' },

  { label: 'Users', to: '/users', icon: UserCog, perm: 'users:manage', group: 'Administration' },
  { label: 'Roles', to: '/roles', icon: ShieldCheck, perm: 'roles:manage', group: 'Administration' },
  { label: 'Audit Logs', to: '/audit-logs', icon: ScrollText, perm: 'audit:view', group: 'Administration' },
  { label: 'Errors', to: '/errors', icon: Bug, perm: 'errors:view', group: 'Administration' },
  // Platform-wide tenant management — spans every hospital, not just the
  // signed-in one, so it's SUPER_ADMIN only (a hospital's own ADMIN must
  // not see or manage other hospitals' tenants). No permission grants it.
  { label: 'Hospitals', to: '/hospitals', icon: Building, perm: null, superAdminOnly: true, group: 'Administration' },
  { label: 'Settings', to: '/settings', icon: Settings, perm: null, group: 'Administration' },
];

// `can` comes from useAuth() and already lets SUPER_ADMIN through everything.
export function navFor({ can, isSuperAdmin }) {
  return NAV_ITEMS.filter((item) => {
    if (item.superAdminOnly) return isSuperAdmin;
    return !item.perm || can(item.perm);
  });
}

// Same list, bucketed into its sidebar sections (in a fixed display order),
// dropping any section that ends up empty for this account.
const GROUP_ORDER = ['Overview', 'Patient Care', 'Diagnostics', 'Pharmacy & Inventory', 'Operations', 'Finance', 'Administration'];

export function groupedNavFor({ can, isSuperAdmin }) {
  const items = navFor({ can, isSuperAdmin });
  return GROUP_ORDER
    .map((group) => ({ group, items: items.filter((i) => i.group === group) }))
    .filter((g) => g.items.length > 0);
}
