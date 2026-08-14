import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Pencil, Phone, HeartPulse, ShieldAlert,
  User, Contact, FileText, Droplet,
} from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import PatientForm from './PatientForm.jsx';
import PatientAppointments from './PatientAppointments.jsx';
import PatientDocuments from './PatientDocuments.jsx';
import PatientOpdVisits from './PatientOpdVisits.jsx';
import PatientAdmissions from './PatientAdmissions.jsx';
import PatientPrescriptions from './PatientPrescriptions.jsx';
import PatientLabReports from './PatientLabReports.jsx';
import PatientBilling from './PatientBilling.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getPatient } from '../../services/patientService.js';
import { CAN_EDIT_PATIENTS, formatDate } from '../../utils/constants.js';

// Live tabs plus future ones (disabled until those modules ship).
const LIVE_TABS = ['Overview', 'Appointments', 'OPD', 'IPD', 'Prescriptions', 'Lab Reports', 'Billing', 'Documents'];
const FUTURE_TABS = [];

function Field({ label, value, mono }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-0.5 text-sm ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
    </div>
  );
}

function Overview({ patient }) {
  const addr = patient.address || {};
  const addrStr = [addr.line, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');
  const ec = patient.emergencyContact || {};
  const ins = patient.insurance || {};
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Contact className="h-4 w-4" /> Contact & Address</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone" value={patient.phone} mono />
          <Field label="Email" value={patient.email} />
          <div className="col-span-2"><Field label="Address" value={addrStr} /></div>
          <Field label="Date of Birth" value={formatDate(patient.dateOfBirth)} />
          <Field label="Registered" value={formatDate(patient.createdAt)} />
        </div>
      </Card>
      <Card>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><ShieldAlert className="h-4 w-4" /> Emergency Contact</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" value={ec.name} />
          <Field label="Relation" value={ec.relation} />
          <Field label="Phone" value={ec.phone} mono />
        </div>
        <h2 className="mb-4 mt-6 flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4" /> Insurance</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Provider" value={ins.provider} />
          <Field label="Policy Number" value={ins.policyNumber} mono />
          <Field label="Valid Till" value={ins.validTill ? formatDate(ins.validTill) : ''} />
        </div>
      </Card>
      <Card className="lg:col-span-2">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><HeartPulse className="h-4 w-4" /> Medical</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Allergies" value={patient.allergies} />
          <Field label="Medical History" value={patient.medicalHistory} />
        </div>
      </Card>
    </div>
  );
}

export default function PatientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const toast = useToast();
  const canEdit = CAN_EDIT_PATIENTS.includes(role);

  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [tab, setTab] = useState('Overview');

  const load = async () => {
    setLoading(true);
    try {
      setPatient(await getPatient(id));
    } catch (err) {
      toast.error(err.message || 'Patient not found');
      navigate('/patients');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (loading) return <Spinner full />;
  if (!patient) return null;

  const initials = (patient.fullName || 'P').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="space-y-5">
      <Link to="/patients" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Back to Patients
      </Link>

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-lg font-semibold text-accent-fg">{initials}</span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{patient.fullName}</h1>
              <Badge tone={patient.status === 'ACTIVE' ? 'success' : 'neutral'}>{patient.status}</Badge>
            </div>
            <p className="mt-0.5 font-mono text-sm text-muted">{patient.uhid}</p>
          </div>
        </div>
        {canEdit && <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Edit</Button>}
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="!p-4"><p className="flex items-center gap-1.5 text-xs text-muted"><User className="h-3.5 w-3.5" /> Gender</p><p className="mt-1 text-lg font-semibold capitalize">{patient.gender?.toLowerCase()}</p></Card>
        <Card className="!p-4"><p className="flex items-center gap-1.5 text-xs text-muted"><HeartPulse className="h-3.5 w-3.5" /> Age</p><p className="mt-1 text-lg font-semibold">{patient.age ?? '—'} yrs</p></Card>
        <Card className="!p-4"><p className="flex items-center gap-1.5 text-xs text-muted"><Droplet className="h-3.5 w-3.5" /> Blood Group</p><p className="mt-1 text-lg font-semibold">{patient.bloodGroup === 'UNKNOWN' ? '—' : patient.bloodGroup}</p></Card>
        <Card className="!p-4"><p className="flex items-center gap-1.5 text-xs text-muted"><Phone className="h-3.5 w-3.5" /> Phone</p><p className="mt-1 text-lg font-semibold tabular-nums">{patient.phone}</p></Card>
      </div>

      {/* Tabs */}
      <Card className="!p-0">
        <div className="flex flex-wrap gap-1 border-b border-border p-2">
          {LIVE_TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ' +
                (tab === t ? 'bg-accent text-accent-fg' : 'text-fg hover:bg-surface')}>
              {t}
            </button>
          ))}
          {FUTURE_TABS.map((t) => (
            <span key={t} className="cursor-not-allowed rounded-lg px-3 py-1.5 text-sm text-muted/50" title="Coming in a later phase">{t}</span>
          ))}
        </div>
        <div className="p-4">
          {tab === 'Overview' && <Overview patient={patient} />}
          {tab === 'Appointments' && <PatientAppointments patient={patient} />}
          {tab === 'OPD' && <PatientOpdVisits patientId={patient.id || patient._id} />}
          {tab === 'IPD' && <PatientAdmissions patientId={patient.id || patient._id} />}
          {tab === 'Prescriptions' && <PatientPrescriptions patientId={patient.id || patient._id} />}
          {tab === 'Lab Reports' && <PatientLabReports patientId={patient.id || patient._id} />}
          {tab === 'Billing' && <PatientBilling patientId={patient.id || patient._id} />}
          {tab === 'Documents' && <PatientDocuments patientId={patient.id || patient._id} />}
        </div>
      </Card>

      <PatientForm open={editOpen} onClose={() => setEditOpen(false)} patient={patient} onSaved={load} />
    </div>
  );
}
