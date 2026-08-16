import {
  LayoutDashboard, Users, Stethoscope, CalendarDays, ClipboardList,
  BedDouble, FlaskConical, Scan, Pill, Receipt, Boxes, Scissors,
  BarChart3, UserCog, Settings, Building2, ShieldCheck, LayoutGrid, ShieldPlus,
  Droplet, Truck, ScrollText, UserRound, Building,
} from 'lucide-react';

// Full V1+ navigation. `roles` lists who may see each item.
// An empty roles array means "all authenticated users".
// `group` drives the section headers the sidebar renders under.
// Items whose page is not built yet are marked `todo` (shown, but disabled).
export const NAV_ITEMS = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard, roles: [], group: 'Overview' },

  { label: 'Patients', to: '/patients', icon: Users, roles: ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'], group: 'Patient Care' },
  { label: 'Appointments', to: '/appointments', icon: CalendarDays, roles: ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'], group: 'Patient Care' },
  { label: 'Doctors', to: '/doctors', icon: Stethoscope, roles: ['ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE'], group: 'Patient Care' },
  { label: 'Departments', to: '/departments', icon: Building2, roles: ['ADMIN'], group: 'Patient Care' },
  { label: 'OPD', to: '/opd', icon: ClipboardList, roles: ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'], group: 'Patient Care' },
  { label: 'IPD', to: '/ipd', icon: BedDouble, roles: ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'], group: 'Patient Care' },
  { label: 'Beds', to: '/beds', icon: LayoutGrid, roles: ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'], group: 'Patient Care' },

  { label: 'Laboratory', to: '/laboratory', icon: FlaskConical, roles: ['ADMIN', 'DOCTOR', 'NURSE', 'LAB_TECHNICIAN', 'RECEPTIONIST'], group: 'Diagnostics' },
  { label: 'Radiology', to: '/radiology', icon: Scan, roles: ['ADMIN', 'DOCTOR', 'RADIOLOGIST', 'NURSE', 'RECEPTIONIST'], group: 'Diagnostics' },
  { label: 'Blood Bank', to: '/blood-bank', icon: Droplet, roles: ['ADMIN', 'LAB_TECHNICIAN', 'DOCTOR', 'NURSE'], group: 'Diagnostics' },

  { label: 'Pharmacy', to: '/pharmacy', icon: Pill, roles: ['ADMIN', 'PHARMACIST', 'DOCTOR', 'NURSE'], group: 'Pharmacy & Inventory' },
  { label: 'Inventory', to: '/inventory', icon: Boxes, roles: ['ADMIN', 'STORE_MANAGER'], group: 'Pharmacy & Inventory' },

  { label: 'OT', to: '/ot', icon: Scissors, roles: ['ADMIN', 'OT_STAFF', 'DOCTOR', 'NURSE'], group: 'Operations' },
  { label: 'Ambulance', to: '/ambulance', icon: Truck, roles: ['ADMIN', 'RECEPTIONIST', 'NURSE'], group: 'Operations' },
  { label: 'HR', to: '/hr', icon: UserRound, roles: ['ADMIN', 'HR'], group: 'Operations' },

  { label: 'Billing', to: '/billing', icon: Receipt, roles: ['ADMIN', 'ACCOUNTANT', 'RECEPTIONIST'], group: 'Finance' },
  { label: 'Insurance', to: '/insurance', icon: ShieldPlus, roles: ['ADMIN', 'ACCOUNTANT'], group: 'Finance' },
  { label: 'Reports', to: '/reports', icon: BarChart3, roles: ['ADMIN', 'ACCOUNTANT'], group: 'Finance' },

  { label: 'Users', to: '/users', icon: UserCog, roles: ['ADMIN'], group: 'Administration' },
  { label: 'Roles', to: '/roles', icon: ShieldCheck, roles: ['ADMIN'], group: 'Administration' },
  { label: 'Audit Logs', to: '/audit-logs', icon: ScrollText, roles: ['ADMIN'], group: 'Administration' },
  // Platform-wide tenant management — spans every hospital, not just the
  // signed-in one, so it's SUPER_ADMIN only (a hospital's own ADMIN must
  // not see or manage other hospitals' tenants).
  { label: 'Hospitals', to: '/hospitals', icon: Building, roles: ['SUPER_ADMIN'], group: 'Administration' },
  { label: 'Settings', to: '/settings', icon: Settings, roles: [], group: 'Administration' },
];

// SUPER_ADMIN sees everything; otherwise filter by the item's role list.
export function navForRole(role) {
  return NAV_ITEMS.filter(
    (item) => item.roles.length === 0 || role === 'SUPER_ADMIN' || item.roles.includes(role)
  );
}

// Same list, bucketed into its sidebar sections (in a fixed display order),
// dropping any section that ends up empty for this role.
const GROUP_ORDER = ['Overview', 'Patient Care', 'Diagnostics', 'Pharmacy & Inventory', 'Operations', 'Finance', 'Administration'];

export function groupedNavForRole(role) {
  const items = navForRole(role);
  return GROUP_ORDER
    .map((group) => ({ group, items: items.filter((i) => i.group === group) }))
    .filter((g) => g.items.length > 0);
}
