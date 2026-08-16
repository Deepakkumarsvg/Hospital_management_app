// Shared enums/options mirrored from the backend models.
export const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
];

export const BLOOD_GROUP_OPTIONS = [
  'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN',
].map((v) => ({ value: v, label: v === 'UNKNOWN' ? 'Unknown' : v }));

export const PATIENT_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

// Which roles may create/edit/delete patients (mirrors backend RBAC).
export const CAN_EDIT_PATIENTS = ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'];
export const CAN_DELETE_PATIENTS = ['SUPER_ADMIN', 'ADMIN'];

// Departments / Doctors are managed by ADMIN only.
export const CAN_MANAGE_ADMIN = ['SUPER_ADMIN', 'ADMIN'];
// Appointments booked/edited by front desk; status advanced by clinical staff too.
export const CAN_BOOK_APPT = ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'];
export const CAN_UPDATE_APPT_STATUS = ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE'];

export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export const APPOINTMENT_TYPE_OPTIONS = [
  { value: 'NEW', label: 'New' },
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'EMERGENCY', label: 'Emergency' },
];

// status -> { label, tone } for badges.
export const APPOINTMENT_STATUS_META = {
  BOOKED: { label: 'Booked', tone: 'neutral' },
  CHECKED_IN: { label: 'Checked-in', tone: 'warning' },
  IN_PROGRESS: { label: 'In progress', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
  NO_SHOW: { label: 'No-show', tone: 'danger' },
};

// Allowed next-statuses (mirrors backend STATUS_TRANSITIONS) for action buttons.
export const APPOINTMENT_NEXT = {
  BOOKED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

// ---- Phase 3: Clinical ----
export const CAN_OPD_EDIT = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'NURSE'];
export const CAN_IPD_ADMIT = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'RECEPTIONIST'];
export const CAN_IPD_NURSE = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'NURSE'];

export const OPD_STATUS_META = {
  OPEN: { label: 'Open', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
};
export const IPD_STATUS_META = {
  ADMITTED: { label: 'Admitted', tone: 'warning' },
  DISCHARGED: { label: 'Discharged', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
};
export const BED_STATUS_META = {
  AVAILABLE: { label: 'Available', tone: 'success' },
  OCCUPIED: { label: 'Occupied', tone: 'danger' },
  RESERVED: { label: 'Reserved', tone: 'warning' },
  MAINTENANCE: { label: 'Maintenance', tone: 'neutral' },
};
export const MED_ROUTE_OPTIONS = ['ORAL', 'IV', 'IM', 'TOPICAL', 'INHALED', 'OTHER'].map((v) => ({ value: v, label: v }));
export const WARD_TYPE_OPTIONS = ['GENERAL', 'SEMI_PRIVATE', 'PRIVATE', 'ICU', 'EMERGENCY', 'PEDIATRIC', 'MATERNITY']
  .map((v) => ({ value: v, label: v.replace(/_/g, ' ') }));

// ---- Phase 4: Diagnostics ----
export const CAN_LAB_ORDER = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR'];
export const CAN_LAB_PROCESS = ['SUPER_ADMIN', 'ADMIN', 'LAB_TECHNICIAN'];
export const CAN_LAB_STATUS = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'LAB_TECHNICIAN'];
export const CAN_RAD_ORDER = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR'];
export const CAN_RAD_PROCESS = ['SUPER_ADMIN', 'ADMIN', 'RADIOLOGIST'];
export const CAN_RAD_STATUS = ['SUPER_ADMIN', 'ADMIN', 'RADIOLOGIST', 'DOCTOR'];

export const LAB_STATUS_META = {
  ORDERED: { label: 'Ordered', tone: 'neutral' },
  SAMPLE_COLLECTED: { label: 'Sample collected', tone: 'warning' },
  PROCESSING: { label: 'Processing', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'warning' },
  VERIFIED: { label: 'Verified', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
};
export const LAB_NEXT = {
  ORDERED: ['SAMPLE_COLLECTED', 'CANCELLED'],
  SAMPLE_COLLECTED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['VERIFIED'],
  VERIFIED: [], CANCELLED: [],
};
export const RESULT_FLAG_OPTIONS = ['NORMAL', 'HIGH', 'LOW', 'ABNORMAL'].map((v) => ({ value: v, label: v }));
export const SAMPLE_TYPE_OPTIONS = ['BLOOD', 'URINE', 'STOOL', 'SWAB', 'TISSUE', 'FLUID', 'OTHER'].map((v) => ({ value: v, label: v }));

export const RAD_STATUS_META = {
  ORDERED: { label: 'Ordered', tone: 'neutral' },
  SCHEDULED: { label: 'Scheduled', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'warning' },
  REPORTED: { label: 'Reported', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
};
export const RAD_NEXT = {
  ORDERED: ['SCHEDULED', 'COMPLETED', 'CANCELLED'],
  SCHEDULED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [], REPORTED: [], CANCELLED: [],
};
export const MODALITY_OPTIONS = ['XRAY', 'CT', 'MRI', 'ULTRASOUND', 'ECG', 'MAMMOGRAPHY', 'OTHER']
  .map((v) => ({ value: v, label: v }));

// ---- Phase 5: Pharmacy & Inventory ----
export const CAN_PHARMACY_MANAGE = ['SUPER_ADMIN', 'ADMIN', 'PHARMACIST'];
export const CAN_INVENTORY_MANAGE = ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER'];

export const MEDICINE_UNIT_OPTIONS = ['TABLET', 'CAPSULE', 'BOTTLE', 'VIAL', 'TUBE', 'SACHET', 'STRIP', 'UNIT']
  .map((v) => ({ value: v, label: v }));
export const ITEM_CATEGORY_OPTIONS = ['CONSUMABLE', 'SURGICAL', 'EQUIPMENT', 'OFFICE', 'OTHER']
  .map((v) => ({ value: v, label: v }));
export const PO_STATUS_META = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  ORDERED: { label: 'Ordered', tone: 'warning' },
  PARTIALLY_RECEIVED: { label: 'Partially Received', tone: 'warning' },
  RECEIVED: { label: 'Received', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
};

// ---- Phase 6: Finance ----
export const CAN_BILLING = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'RECEPTIONIST'];
// Cancelling/refunding reverses money already billed or collected — finance roles only.
export const CAN_BILLING_REVERSE = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'];
export const CAN_INSURANCE = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'];

export const INVOICE_CATEGORY_OPTIONS = [
  'CONSULTATION', 'ROOM', 'BED', 'LABORATORY', 'RADIOLOGY', 'MEDICINE', 'PROCEDURE', 'SURGERY', 'OTHER',
].map((v) => ({ value: v, label: v.charAt(0) + v.slice(1).toLowerCase() }));

export const INVOICE_STATUS_META = {
  PENDING: { label: 'Pending', tone: 'warning' },
  PARTIAL: { label: 'Partial', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
};
export const PAYMENT_METHOD_OPTIONS = [
  { value: 'CASH', label: 'Cash' }, { value: 'CARD', label: 'Card' }, { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' }, { value: 'INSURANCE', label: 'Insurance' },
];

export const CLAIM_STATUS_META = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SUBMITTED: { label: 'Submitted', tone: 'warning' },
  UNDER_REVIEW: { label: 'Under review', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  SETTLED: { label: 'Settled', tone: 'success' },
};
export const CLAIM_NEXT = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['SETTLED'],
  REJECTED: ['DRAFT'], SETTLED: [],
};

export function money(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ---- Phase 7: Advanced ----
export const CAN_OT_MANAGE = ['SUPER_ADMIN', 'ADMIN', 'OT_STAFF', 'DOCTOR'];
export const CAN_BLOOD_MANAGE = ['SUPER_ADMIN', 'ADMIN', 'LAB_TECHNICIAN'];
export const CAN_HR = ['SUPER_ADMIN', 'ADMIN', 'HR'];
export const CAN_AMBULANCE_MANAGE = ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'];

export const SURGERY_STATUS_META = {
  SCHEDULED: { label: 'Scheduled', tone: 'warning' },
  IN_PROGRESS: { label: 'In progress', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
};
export const SURGERY_NEXT = { SCHEDULED: ['IN_PROGRESS', 'CANCELLED'], IN_PROGRESS: ['COMPLETED', 'CANCELLED'], COMPLETED: [], CANCELLED: [] };

export const BLOOD_GROUP_LIST = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const BLOOD_GROUP_SELECT = BLOOD_GROUP_LIST.map((v) => ({ value: v, label: v }));
export const BLOOD_COMPONENT_OPTIONS = ['WHOLE_BLOOD', 'PRBC', 'PLATELETS', 'FFP', 'CRYOPRECIPITATE'].map((v) => ({ value: v, label: v.replace(/_/g, ' ') }));
export const UNIT_STATUS_META = {
  AVAILABLE: { label: 'Available', tone: 'success' },
  RESERVED: { label: 'Reserved', tone: 'warning' },
  ISSUED: { label: 'Issued', tone: 'neutral' },
  EXPIRED: { label: 'Expired', tone: 'danger' },
  DISCARDED: { label: 'Discarded', tone: 'danger' },
};

export const SHIFT_OPTIONS = ['GENERAL', 'MORNING', 'EVENING', 'NIGHT'].map((v) => ({ value: v, label: v }));
export const ATTENDANCE_STATUS_OPTIONS = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'].map((v) => ({ value: v, label: v.replace(/_/g, ' ') }));
export const LEAVE_TYPE_OPTIONS = ['CASUAL', 'SICK', 'EARNED', 'UNPAID'].map((v) => ({ value: v, label: v }));
export const LEAVE_STATUS_META = {
  PENDING: { label: 'Pending', tone: 'warning' }, APPROVED: { label: 'Approved', tone: 'success' }, REJECTED: { label: 'Rejected', tone: 'danger' },
};
export const PAYSLIP_STATUS_META = {
  GENERATED: { label: 'Generated', tone: 'warning' }, PAID: { label: 'Paid', tone: 'success' },
};
export const MONTH_OPTIONS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  .map((v, i) => ({ value: String(i + 1), label: v }));

export const AMBULANCE_STATUS_META = {
  AVAILABLE: { label: 'Available', tone: 'success' }, ON_TRIP: { label: 'On trip', tone: 'warning' }, MAINTENANCE: { label: 'Maintenance', tone: 'neutral' },
};
export const TRIP_STATUS_META = {
  ONGOING: { label: 'Ongoing', tone: 'warning' }, COMPLETED: { label: 'Completed', tone: 'success' }, CANCELLED: { label: 'Cancelled', tone: 'danger' },
};

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Convert a Date/ISO string to yyyy-mm-dd for <input type="date">.
export function toDateInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}
