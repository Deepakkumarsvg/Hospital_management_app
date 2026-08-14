// Central definition of all system roles (RBAC).
// Keep this as the single source of truth for role names.

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  DOCTOR: 'DOCTOR',
  NURSE: 'NURSE',
  RECEPTIONIST: 'RECEPTIONIST',
  LAB_TECHNICIAN: 'LAB_TECHNICIAN',
  RADIOLOGIST: 'RADIOLOGIST',
  PHARMACIST: 'PHARMACIST',
  ACCOUNTANT: 'ACCOUNTANT',
  STORE_MANAGER: 'STORE_MANAGER',
  OT_STAFF: 'OT_STAFF',
  HR: 'HR',
  // Self-service portal account, linked to a Patient profile. Sees only own data.
  PATIENT: 'PATIENT',
};

export const ROLE_LIST = Object.values(ROLES);

// Human-readable descriptions used when seeding the roles collection.
export const ROLE_DEFINITIONS = [
  { name: ROLES.SUPER_ADMIN, description: 'Full system access, manages everything' },
  { name: ROLES.ADMIN, description: 'Hospital administration and configuration' },
  { name: ROLES.DOCTOR, description: 'Consultation, diagnosis, prescriptions, reports' },
  { name: ROLES.NURSE, description: 'Vitals, nursing notes, admitted patient care' },
  { name: ROLES.RECEPTIONIST, description: 'Patient registration, appointments, billing desk' },
  { name: ROLES.LAB_TECHNICIAN, description: 'Lab orders, sample collection, result entry' },
  { name: ROLES.RADIOLOGIST, description: 'Radiology investigations and reports' },
  { name: ROLES.PHARMACIST, description: 'Prescriptions, medicine issue, pharmacy stock' },
  { name: ROLES.ACCOUNTANT, description: 'Invoices, payments, financial reports' },
  { name: ROLES.STORE_MANAGER, description: 'Inventory, vendors, purchase orders' },
  { name: ROLES.OT_STAFF, description: 'Operation theatre scheduling and records' },
  { name: ROLES.HR, description: 'Employee, attendance, payroll management' },
  { name: ROLES.PATIENT, description: 'Patient self-service portal — own appointments, reports and bills' },
];
