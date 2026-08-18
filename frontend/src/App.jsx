import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import DashboardLayout from './layouts/DashboardLayout.jsx';
import PortalLayout from './layouts/PortalLayout.jsx';
import { useAuth } from './context/AuthContext.jsx';
import PageLoader from './components/PageLoader.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Login from './pages/Login.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import PortalRegister from './pages/portal/PortalRegister.jsx';
const PortalDashboard = lazy(() => import('./pages/portal/PortalDashboard.jsx'));
const PortalAppointments = lazy(() => import('./pages/portal/PortalAppointments.jsx'));
const PortalRecords = lazy(() => import('./pages/portal/PortalRecords.jsx'));
const PortalBills = lazy(() => import('./pages/portal/PortalBills.jsx'));
const PortalProfile = lazy(() => import('./pages/portal/PortalProfile.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const PatientsList = lazy(() => import('./pages/patients/PatientsList.jsx'));
const PatientDetail = lazy(() => import('./pages/patients/PatientDetail.jsx'));
const Departments = lazy(() => import('./pages/departments/Departments.jsx'));
const DoctorsList = lazy(() => import('./pages/doctors/DoctorsList.jsx'));
const DoctorDetail = lazy(() => import('./pages/doctors/DoctorDetail.jsx'));
const AppointmentsList = lazy(() => import('./pages/appointments/AppointmentsList.jsx'));
const UsersList = lazy(() => import('./pages/users/UsersList.jsx'));
const Roles = lazy(() => import('./pages/roles/Roles.jsx'));
const OpdList = lazy(() => import('./pages/opd/OpdList.jsx'));
const OpdConsultation = lazy(() => import('./pages/opd/OpdConsultation.jsx'));
const Emergency = lazy(() => import('./pages/emergency/Emergency.jsx'));
const IpdList = lazy(() => import('./pages/ipd/IpdList.jsx'));
const IpdDetail = lazy(() => import('./pages/ipd/IpdDetail.jsx'));
const Beds = lazy(() => import('./pages/beds/Beds.jsx'));
const Laboratory = lazy(() => import('./pages/laboratory/Laboratory.jsx'));
const LabOrderDetail = lazy(() => import('./pages/laboratory/LabOrderDetail.jsx'));
const Radiology = lazy(() => import('./pages/radiology/Radiology.jsx'));
const RadOrderDetail = lazy(() => import('./pages/radiology/RadOrderDetail.jsx'));
const Reports = lazy(() => import('./pages/reports/Reports.jsx'));
const Pharmacy = lazy(() => import('./pages/pharmacy/Pharmacy.jsx'));
const Inventory = lazy(() => import('./pages/inventory/Inventory.jsx'));
const BillingList = lazy(() => import('./pages/billing/BillingList.jsx'));
const InvoiceDetail = lazy(() => import('./pages/billing/InvoiceDetail.jsx'));
const Insurance = lazy(() => import('./pages/insurance/Insurance.jsx'));
const ClaimDetail = lazy(() => import('./pages/insurance/ClaimDetail.jsx'));
const OT = lazy(() => import('./pages/ot/OT.jsx'));
const BloodBank = lazy(() => import('./pages/bloodbank/BloodBank.jsx'));
const HR = lazy(() => import('./pages/hr/HR.jsx'));
const Ambulance = lazy(() => import('./pages/ambulance/Ambulance.jsx'));
const AuditLogs = lazy(() => import('./pages/audit/AuditLogs.jsx'));
const ErrorLogs = lazy(() => import('./pages/ops/ErrorLogs.jsx'));
const TariffPlans = lazy(() => import('./pages/tariffs/TariffPlans.jsx'));
const Settings = lazy(() => import('./pages/settings/Settings.jsx'));
const Hospitals = lazy(() => import('./pages/hospitals/Hospitals.jsx'));
import NotFound from './pages/NotFound.jsx';

// Permission groups mirror the server's route guards (config/permissions.js).
// The UI gates on permissions, not role names, so an edited permission matrix
// actually changes what people can see — see ProtectedRoute.
const P = {
  patients: ['patients:view'],
  appointments: ['appointments:view'],
  doctors: ['doctors:view'],
  departments: ['departments:manage'],
  opd: ['opd:view'],
  ipd: ['ipd:view'],
  emergency: ['emergency:view'],
  beds: ['facilities:view'],
  lab: ['laboratory:view'],
  radiology: ['radiology:view'],
  reports: ['reports:view'],
  pharmacy: ['pharmacy:view'],
  inventory: ['inventory:view'],
  billing: ['billing:view'],
  insurance: ['insurance:view'],
  ot: ['ot:view'],
  bloodBank: ['bloodbank:view'],
  hr: ['hr:view'],
  ambulance: ['ambulance:view'],
  audit: ['audit:view'],
  errors: ['errors:view'],
  users: ['users:manage'],
  roles: ['roles:manage'],
  tariffs: ['tariffs:view'],
};

function Guard({ anyOf, children }) {
  return <ProtectedRoute anyOf={anyOf}>{children}</ProtectedRoute>;
}

// The cross-hospital console belongs to the platform operator, not to any
// hospital role — so it is gated on identity, exactly as the server gates it
// (authorize(ROLES.SUPER_ADMIN)), and no permission can grant it.
function SuperAdminOnly({ children }) {
  const { isAuthenticated, loading, role } = useAuth();
  if (loading) return <PageLoader label="Restoring your session…" />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (role !== 'SUPER_ADMIN') return <Navigate to="/" replace />;
  return children;
}

// Staff area: authenticated + NOT a patient (patients belong in /portal).
function RequireStaff({ children }) {
  const { isAuthenticated, loading, role } = useAuth();
  if (loading) return <PageLoader label="Restoring your session…" />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (role === 'PATIENT') return <Navigate to="/portal" replace />;
  return children;
}

// Portal area: authenticated + a patient (staff belong in the dashboard).
function RequirePatient({ children }) {
  const { isAuthenticated, loading, role } = useAuth();
  if (loading) return <PageLoader label="Restoring your session…" />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (role !== 'PATIENT') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      {/* Every page below is code-split, so there is always a moment where the
          chunk is still arriving — Suspense is what fills it instead of a blank
          frame. ErrorBoundary sits outside it so a chunk that fails to load,
          or a component that throws while rendering, lands on something
          recoverable rather than a white page. */}
      <ErrorBoundary>
        <Suspense fallback={<PageLoader label="Loading…" />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
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

          <Route path="/patients" element={<Guard anyOf={P.patients}><PatientsList /></Guard>} />
          <Route path="/patients/:id" element={<Guard anyOf={P.patients}><PatientDetail /></Guard>} />

          <Route path="/appointments" element={<Guard anyOf={P.appointments}><AppointmentsList /></Guard>} />

          <Route path="/opd" element={<Guard anyOf={P.opd}><OpdList /></Guard>} />
          <Route path="/opd/:id" element={<Guard anyOf={P.opd}><OpdConsultation /></Guard>} />
          <Route path="/emergency" element={<Guard anyOf={P.emergency}><Emergency /></Guard>} />
          <Route path="/ipd" element={<Guard anyOf={P.ipd}><IpdList /></Guard>} />
          <Route path="/ipd/:id" element={<Guard anyOf={P.ipd}><IpdDetail /></Guard>} />
          <Route path="/beds" element={<Guard anyOf={P.beds}><Beds /></Guard>} />

          <Route path="/laboratory" element={<Guard anyOf={P.lab}><Laboratory /></Guard>} />
          <Route path="/laboratory/:id" element={<Guard anyOf={P.lab}><LabOrderDetail /></Guard>} />
          <Route path="/radiology" element={<Guard anyOf={P.radiology}><Radiology /></Guard>} />
          <Route path="/radiology/:id" element={<Guard anyOf={P.radiology}><RadOrderDetail /></Guard>} />
          <Route path="/reports" element={<Guard anyOf={P.reports}><Reports /></Guard>} />
          <Route path="/pharmacy" element={<Guard anyOf={P.pharmacy}><Pharmacy /></Guard>} />
          <Route path="/inventory" element={<Guard anyOf={P.inventory}><Inventory /></Guard>} />
          <Route path="/billing" element={<Guard anyOf={P.billing}><BillingList /></Guard>} />
          <Route path="/billing/:id" element={<Guard anyOf={P.billing}><InvoiceDetail /></Guard>} />
          <Route path="/tariffs" element={<Guard anyOf={P.tariffs}><TariffPlans /></Guard>} />
          <Route path="/insurance" element={<Guard anyOf={P.insurance}><Insurance /></Guard>} />
          <Route path="/insurance/:id" element={<Guard anyOf={P.insurance}><ClaimDetail /></Guard>} />

          <Route path="/ot" element={<Guard anyOf={P.ot}><OT /></Guard>} />
          <Route path="/blood-bank" element={<Guard anyOf={P.bloodBank}><BloodBank /></Guard>} />
          <Route path="/hr" element={<Guard anyOf={P.hr}><HR /></Guard>} />
          <Route path="/ambulance" element={<Guard anyOf={P.ambulance}><Ambulance /></Guard>} />
          <Route path="/audit-logs" element={<Guard anyOf={P.audit}><AuditLogs /></Guard>} />
          <Route path="/errors" element={<Guard anyOf={P.errors}><ErrorLogs /></Guard>} />

          <Route path="/doctors" element={<Guard anyOf={P.doctors}><DoctorsList /></Guard>} />
          <Route path="/doctors/:id" element={<Guard anyOf={P.doctors}><DoctorDetail /></Guard>} />

          <Route path="/departments" element={<Guard anyOf={P.departments}><Departments /></Guard>} />
          <Route path="/users" element={<Guard anyOf={P.users}><UsersList /></Guard>} />
          <Route path="/roles" element={<Guard anyOf={P.roles}><Roles /></Guard>} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/hospitals" element={<SuperAdminOnly><Hospitals /></SuperAdminOnly>} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
