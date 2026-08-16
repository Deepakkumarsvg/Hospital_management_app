import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  ArrowLeft, Pencil, Phone, HeartPulse, ShieldAlert,
  User, Contact, FileText, Droplet, Printer, Merge, History,
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
import PatientInsuranceClaims from './PatientInsuranceClaims.jsx';
import MergePatientModal from './MergePatientModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getPatient } from '../../services/patientService.js';
import { listAuditLogs } from '../../services/auditService.js';
import { CAN_EDIT_PATIENTS, CAN_DELETE_PATIENTS, CAN_INSURANCE, formatDate, formatDateTime } from '../../utils/constants.js';

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

// Admin-only — surfaces the audit trail for this patient's record.
function RecentActivity({ uhid }) {
  const [logs, setLogs] = useState(null);

  useEffect(() => {
    if (!uhid) return;
    listAuditLogs({ search: uhid, limit: 10 })
      .then((r) => setLogs(r.items.filter((l) => l.recordId === uhid)))
      .catch(() => setLogs([]));
  }, [uhid]);

  return (
    <Card className="lg:col-span-2">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" /> Recent Activity</h2>
      {logs === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-muted">No recorded activity for this patient yet.</p>
      ) : (
        <ul className="space-y-2">
          {logs.map((l) => (
            <li key={l.id || l._id} className="flex items-start justify-between gap-3 border-b border-border/60 pb-2 text-sm last:border-0 last:pb-0">
              <div>
                <span className="font-medium">{l.action}</span> · {l.description || l.module}
                {l.userName && <span className="text-muted"> — {l.userName}</span>}
              </div>
              <span className="shrink-0 text-xs text-muted tabular-nums">{formatDateTime(l.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Overview({ patient, canViewAudit }) {
  const addr = patient.address || {};
  const addrStr = [addr.line, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');
  const ec = patient.emergencyContact || {};
  const insurances = patient.insurances || [];
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
        {insurances.length === 0 ? (
          <p className="text-sm text-muted">No insurance policies on file.</p>
        ) : (
          <div className="space-y-3">
            {insurances.map((ins, i) => (
              <div key={i} className="grid grid-cols-2 gap-4 border-t border-border pt-3 first:border-0 first:pt-0">
                <Field label="Provider" value={ins.provider} />
                <Field label="Policy Number" value={ins.policyNumber} mono />
                <Field label="Valid Till" value={ins.validTill ? formatDate(ins.validTill) : ''} />
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card className="lg:col-span-2">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><HeartPulse className="h-4 w-4" /> Medical</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Allergies" value={patient.allergies} />
          <Field label="Medical History" value={patient.medicalHistory} />
        </div>
      </Card>
      {canViewAudit && <RecentActivity uhid={patient.uhid} />}
    </div>
  );
}

// Printable ID card — hidden on screen, shown only in the print stylesheet.
function IdCard({ patient }) {
  const [qr, setQr] = useState('');

  useEffect(() => {
    if (!patient?.uhid) return;
    QRCode.toDataURL(patient.uhid, { margin: 1, width: 200 }).then(setQr).catch(() => setQr(''));
  }, [patient?.uhid]);

  return (
    <div className="hidden print:block">
      <div className="mx-auto w-[85mm] rounded-xl border border-black p-4 text-black">
        <p className="text-center text-xs font-semibold uppercase tracking-widest">Hospital Management System</p>
        <p className="text-center text-[10px] uppercase tracking-widest text-neutral-600">Patient ID Card</p>
        <div className="my-3 border-t border-black" />
        <div className="flex items-center gap-3">
          {qr && <img src={qr} alt="" className="h-20 w-20 shrink-0" />}
          <div>
            <p className="text-lg font-bold">{patient.fullName}</p>
            <p className="font-mono text-sm">{patient.uhid}</p>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
          <p><span className="text-neutral-600">Gender:</span> {patient.gender}</p>
          <p><span className="text-neutral-600">Age:</span> {patient.age ?? '—'} yrs</p>
          <p><span className="text-neutral-600">Blood Group:</span> {patient.bloodGroup === 'UNKNOWN' ? '—' : patient.bloodGroup}</p>
          <p><span className="text-neutral-600">Phone:</span> {patient.phone}</p>
        </div>
        {patient.emergencyContact?.phone && (
          <p className="mt-2 text-xs"><span className="text-neutral-600">Emergency:</span> {patient.emergencyContact.name} · {patient.emergencyContact.phone}</p>
        )}
        <div className="my-3 border-t border-black" />
        <p className="text-center text-[10px] text-neutral-600">Please carry this card on every visit. Scan the QR to pull up UHID at the front desk.</p>
      </div>
    </div>
  );
}

export default function PatientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const toast = useToast();
  const canEdit = CAN_EDIT_PATIENTS.includes(role);
  const canMerge = CAN_DELETE_PATIENTS.includes(role);
  const canViewInsurance = CAN_INSURANCE.includes(role);
  const tabs = canViewInsurance ? [...LIVE_TABS, 'Insurance'] : LIVE_TABS;

  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
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
    <>
    <div className="space-y-5 print:hidden">
      <Link to="/patients" className="btn-outline w-fit !bg-surface !text-fg hover:!bg-elevated">
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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print ID Card</Button>
          {canMerge && <Button variant="outline" onClick={() => setMergeOpen(true)}><Merge className="h-4 w-4" /> Merge Duplicate</Button>}
          {canEdit && <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Edit</Button>}
        </div>
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
          {tabs.map((t) => (
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
          {tab === 'Overview' && <Overview patient={patient} canViewAudit={canMerge} />}
          {tab === 'Appointments' && <PatientAppointments patient={patient} />}
          {tab === 'OPD' && <PatientOpdVisits patientId={patient.id || patient._id} />}
          {tab === 'IPD' && <PatientAdmissions patientId={patient.id || patient._id} />}
          {tab === 'Prescriptions' && <PatientPrescriptions patientId={patient.id || patient._id} />}
          {tab === 'Lab Reports' && <PatientLabReports patientId={patient.id || patient._id} />}
          {tab === 'Billing' && <PatientBilling patientId={patient.id || patient._id} />}
          {tab === 'Documents' && <PatientDocuments patientId={patient.id || patient._id} />}
          {tab === 'Insurance' && canViewInsurance && <PatientInsuranceClaims patientId={patient.id || patient._id} />}
        </div>
      </Card>

      <PatientForm open={editOpen} onClose={() => setEditOpen(false)} patient={patient} onSaved={load} />
      <MergePatientModal open={mergeOpen} onClose={() => setMergeOpen(false)} patient={patient} onMerged={load} />
    </div>
    <IdCard patient={patient} />
    </>
  );
}
