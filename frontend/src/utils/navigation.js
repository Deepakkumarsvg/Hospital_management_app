import {
  LayoutDashboard, Users, Stethoscope, CalendarDays, ClipboardList,
  BedDouble, FlaskConical, Scan, Pill, Receipt, Boxes, Scissors,
  BarChart3, UserCog, Settings, Building2, ShieldCheck, LayoutGrid, ShieldPlus,
  Droplet, Truck, ScrollText, UserRound, Building,
} from 'lucide-react';

// Full V1+ navigation. `roles` lists who may see each item.
// An empty roles array means "all authenticated users".
// Items whose page is not built yet are marked `todo` (shown, but disabled).
export const NAV_ITEMS = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard, roles: [] },
  { label: 'Patients', to: '/patients', icon: Users, roles: ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'] },
  { label: 'Appointments', to: '/appointments', icon: CalendarDays, roles: ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'] },
  { label: 'Doctors', to: '/doctors', icon: Stethoscope, roles: ['ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE'] },
  { label: 'Departments', to: '/departments', icon: Building2, roles: ['ADMIN'] },
  { label: 'OPD', to: '/opd', icon: ClipboardList, roles: ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'] },
  { label: 'IPD', to: '/ipd', icon: BedDouble, roles: ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'] },
  { label: 'Beds', to: '/beds', icon: LayoutGrid, roles: ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'] },
  { label: 'Laboratory', to: '/laboratory', icon: FlaskConical, roles: ['ADMIN', 'DOCTOR', 'NURSE', 'LAB_TECHNICIAN', 'RECEPTIONIST'] },
  { label: 'Radiology', to: '/radiology', icon: Scan, roles: ['ADMIN', 'DOCTOR', 'RADIOLOGIST', 'NURSE', 'RECEPTIONIST'] },
  { label: 'Pharmacy', to: '/pharmacy', icon: Pill, roles: ['ADMIN', 'PHARMACIST', 'DOCTOR', 'NURSE'] },
  { label: 'Inventory', to: '/inventory', icon: Boxes, roles: ['ADMIN', 'STORE_MANAGER'] },
  { label: 'Billing', to: '/billing', icon: Receipt, roles: ['ADMIN', 'ACCOUNTANT', 'RECEPTIONIST'] },
  { label: 'Insurance', to: '/insurance', icon: ShieldPlus, roles: ['ADMIN', 'ACCOUNTANT'] },
  { label: 'OT', to: '/ot', icon: Scissors, roles: ['ADMIN', 'OT_STAFF', 'DOCTOR', 'NURSE'] },
  { label: 'Blood Bank', to: '/blood-bank', icon: Droplet, roles: ['ADMIN', 'LAB_TECHNICIAN', 'DOCTOR', 'NURSE'] },
  { label: 'Ambulance', to: '/ambulance', icon: Truck, roles: ['ADMIN', 'RECEPTIONIST', 'NURSE'] },
  { label: 'HR', to: '/hr', icon: UserRound, roles: ['ADMIN', 'HR'] },
  { label: 'Reports', to: '/reports', icon: BarChart3, roles: ['ADMIN', 'ACCOUNTANT'] },
  { label: 'Users', to: '/users', icon: UserCog, roles: ['ADMIN'] },
  { label: 'Roles', to: '/roles', icon: ShieldCheck, roles: ['ADMIN'] },
  { label: 'Audit Logs', to: '/audit-logs', icon: ScrollText, roles: ['ADMIN'] },
  { label: 'Hospitals', to: '/hospitals', icon: Building, roles: ['ADMIN'] },
  { label: 'Settings', to: '/settings', icon: Settings, roles: [] },
];

// SUPER_ADMIN sees everything; otherwise filter by the item's role list.
export function navForRole(role) {
  return NAV_ITEMS.filter(
    (item) => item.roles.length === 0 || role === 'SUPER_ADMIN' || item.roles.includes(role)
  );
}
