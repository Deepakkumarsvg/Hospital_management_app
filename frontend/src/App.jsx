import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import DashboardLayout from './layouts/DashboardLayout.jsx';
import PortalLayout from './layouts/PortalLayout.jsx';
import { useAuth } from './context/AuthContext.jsx';
import Spinner from './components/ui/Spinner.jsx';
import Login from './pages/Login.jsx';
import PortalRegister from './pages/portal/PortalRegister.jsx';
import PortalDashboard from './pages/portal/PortalDashboard.jsx';
import PortalAppointments from './pages/portal/PortalAppointments.jsx';
import PortalRecords from './pages/portal/PortalRecords.jsx';
import PortalBills from './pages/portal/PortalBills.jsx';
import PortalProfile from './pages/portal/PortalProfile.jsx';
import Dashboard from './pages/Dashboard.jsx';
import PatientsList from './pages/patients/PatientsList.jsx';
import PatientDetail from './pages/patients/PatientDetail.jsx';
import Departments from './pages/departments/Departments.jsx';
import DoctorsList from './pages/doctors/DoctorsList.jsx';
import DoctorDetail from './pages/doctors/DoctorDetail.jsx';
import AppointmentsList from './pages/appointments/AppointmentsList.jsx';
import UsersList from './pages/users/UsersList.jsx';
import Roles from './pages/roles/Roles.jsx';
import OpdList from './pages/opd/OpdList.jsx';
import OpdConsultation from './pages/opd/OpdConsultation.jsx';
import IpdList from './pages/ipd/IpdList.jsx';
import IpdDetail from './pages/ipd/IpdDetail.jsx';
import Beds from './pages/beds/Beds.jsx';
import Laboratory from './pages/laboratory/Laboratory.jsx';
import LabOrderDetail from './pages/laboratory/LabOrderDetail.jsx';
import Radiology from './pages/radiology/Radiology.jsx';
import RadOrderDetail from './pages/radiology/RadOrderDetail.jsx';
import Reports from './pages/reports/Reports.jsx';
import Pharmacy from './pages/pharmacy/Pharmacy.jsx';
import Inventory from './pages/inventory/Inventory.jsx';
import BillingList from './pages/billing/BillingList.jsx';
import InvoiceDetail from './pages/billing/InvoiceDetail.jsx';
import Insurance from './pages/insurance/Insurance.jsx';
import ClaimDetail from './pages/insurance/ClaimDetail.jsx';
import OT from './pages/ot/OT.jsx';
import BloodBank from './pages/bloodbank/BloodBank.jsx';
import HR from './pages/hr/HR.jsx';
import Ambulance from './pages/ambulance/Ambulance.jsx';
import AuditLogs from './pages/audit/AuditLogs.jsx';
import Settings from './pages/settings/Settings.jsx';
import Hospitals from './pages/hospitals/Hospitals.jsx';
import NotFound from './pages/NotFound.jsx';

// Role groups mirror backend RBAC.
const PATIENT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'];
const APPT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'];
const DOCTOR_VIEW_ROLES = ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE'];
const CLINICAL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'];
const LAB_ROLES = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'NURSE', 'LAB_TECHNICIAN', 'RECEPTIONIST'];
const RAD_ROLES = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'RADIOLOGIST', 'NURSE', 'RECEPTIONIST'];
const REPORT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'];
const PHARMACY_ROLES = ['SUPER_ADMIN', 'ADMIN', 'PHARMACIST', 'DOCTOR', 'NURSE'];
const INVENTORY_ROLES = ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER'];
const BILLING_ROLES = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'RECEPTIONIST'];
const INSURANCE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'];
const OT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'OT_STAFF', 'DOCTOR', 'NURSE'];
const BLOOD_ROLES = ['SUPER_ADMIN', 'ADMIN', 'LAB_TECHNICIAN', 'DOCTOR', 'NURSE'];
const HR_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR'];
const AMBULANCE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE'];
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];

function Guard({ roles, children }) {
  return <ProtectedRoute roles={roles}>{children}</ProtectedRoute>;
}

// Staff area: authenticated + NOT a patient (patients belong in /portal).
function RequireStaff({ children }) {
  const { isAuthenticated, loading, role } = useAuth();
  if (loading) return <Spinner full />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (role === 'PATIENT') return <Navigate to="/portal" replace />;
  return children;
}

// Portal area: authenticated + a patient (staff belong in the dashboard).
function RequirePatient({ children }) {
  const { isAuthenticated, loading, role } = useAuth();
  if (loading) return <Spinner full />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (role !== 'PATIENT') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/portal/register" element={<PortalRegister />} />

        {/* Patient self-service portal */}
        <Route element={<RequirePatient><PortalLayout /></RequirePatient>}>
          <Route path="/portal" element={<PortalDashboard />} />
          <Route path="/portal/appointments" element={<PortalAppointments />} />
          <Route path="/portal/records" element={<PortalRecords />} />
          <Route path="/portal/bills" element={<PortalBills />} />
          <Route path="/portal/profile" element={<PortalProfile />} />
        </Route>

        {/* Staff area — everything below requires a non-patient account */}
        <Route
          element={
            <RequireStaff>
              <DashboardLayout />
            </RequireStaff>
          }
        >
          <Route path="/" element={<Dashboard />} />

          <Route path="/patients" element={<Guard roles={PATIENT_ROLES}><PatientsList /></Guard>} />
          <Route path="/patients/:id" element={<Guard roles={PATIENT_ROLES}><PatientDetail /></Guard>} />

          <Route path="/appointments" element={<Guard roles={APPT_ROLES}><AppointmentsList /></Guard>} />

          <Route path="/opd" element={<Guard roles={CLINICAL_ROLES}><OpdList /></Guard>} />
          <Route path="/opd/:id" element={<Guard roles={CLINICAL_ROLES}><OpdConsultation /></Guard>} />
          <Route path="/ipd" element={<Guard roles={CLINICAL_ROLES}><IpdList /></Guard>} />
          <Route path="/ipd/:id" element={<Guard roles={CLINICAL_ROLES}><IpdDetail /></Guard>} />
          <Route path="/beds" element={<Guard roles={CLINICAL_ROLES}><Beds /></Guard>} />

          <Route path="/laboratory" element={<Guard roles={LAB_ROLES}><Laboratory /></Guard>} />
          <Route path="/laboratory/:id" element={<Guard roles={LAB_ROLES}><LabOrderDetail /></Guard>} />
          <Route path="/radiology" element={<Guard roles={RAD_ROLES}><Radiology /></Guard>} />
          <Route path="/radiology/:id" element={<Guard roles={RAD_ROLES}><RadOrderDetail /></Guard>} />
          <Route path="/reports" element={<Guard roles={REPORT_ROLES}><Reports /></Guard>} />
          <Route path="/pharmacy" element={<Guard roles={PHARMACY_ROLES}><Pharmacy /></Guard>} />
          <Route path="/inventory" element={<Guard roles={INVENTORY_ROLES}><Inventory /></Guard>} />
          <Route path="/billing" element={<Guard roles={BILLING_ROLES}><BillingList /></Guard>} />
          <Route path="/billing/:id" element={<Guard roles={BILLING_ROLES}><InvoiceDetail /></Guard>} />
          <Route path="/insurance" element={<Guard roles={INSURANCE_ROLES}><Insurance /></Guard>} />
          <Route path="/insurance/:id" element={<Guard roles={INSURANCE_ROLES}><ClaimDetail /></Guard>} />

          <Route path="/ot" element={<Guard roles={OT_ROLES}><OT /></Guard>} />
          <Route path="/blood-bank" element={<Guard roles={BLOOD_ROLES}><BloodBank /></Guard>} />
          <Route path="/hr" element={<Guard roles={HR_ROLES}><HR /></Guard>} />
          <Route path="/ambulance" element={<Guard roles={AMBULANCE_ROLES}><Ambulance /></Guard>} />
          <Route path="/audit-logs" element={<Guard roles={ADMIN_ROLES}><AuditLogs /></Guard>} />

          <Route path="/doctors" element={<Guard roles={DOCTOR_VIEW_ROLES}><DoctorsList /></Guard>} />
          <Route path="/doctors/:id" element={<Guard roles={DOCTOR_VIEW_ROLES}><DoctorDetail /></Guard>} />

          <Route path="/departments" element={<Guard roles={ADMIN_ROLES}><Departments /></Guard>} />
          <Route path="/users" element={<Guard roles={ADMIN_ROLES}><UsersList /></Guard>} />
          <Route path="/roles" element={<Guard roles={ADMIN_ROLES}><Roles /></Guard>} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/hospitals" element={<Guard roles={ADMIN_ROLES}><Hospitals /></Guard>} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
