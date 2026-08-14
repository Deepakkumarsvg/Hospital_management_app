import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, BedDouble, StickyNote, ArrowLeftRight, LogOut, Clock, Send, FileDown } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getAdmission, addNursingNote, transferBed, dischargePatient, downloadDischargePdf } from '../../services/ipdService.js';
import { availableBeds } from '../../services/facilityService.js';
import { CAN_IPD_ADMIT, CAN_IPD_NURSE, IPD_STATUS_META, formatDateTime, formatDate } from '../../utils/constants.js';

function Field({ label, value }) {
  return <div><p className="text-xs uppercase tracking-wide text-muted">{label}</p><p className="mt-0.5 text-sm">{value || '—'}</p></div>;
}

export default function IpdDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const toast = useToast();
  const canAdmit = CAN_IPD_ADMIT.includes(role);
  const canNurse = CAN_IPD_NURSE.includes(role);

  const [adm, setAdm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [dischargeOpen, setDischargeOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setAdm(await getAdmission(id)); }
    catch (err) { toast.error(err.message || 'Admission not found'); navigate('/ipd'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (loading) return <Spinner full />;
  if (!adm) return null;

  const active = adm.status === 'ADMITTED';
  const meta = IPD_STATUS_META[adm.status] || { label: adm.status, tone: 'neutral' };

  const submitNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    setNoteSaving(true);
    try { setAdm(await addNursingNote(id, note.trim())); setNote(''); toast.success('Note added'); }
    catch (err) { toast.error(err.message || 'Failed'); }
    finally { setNoteSaving(false); }
  };

  return (
    <div className="space-y-5">
      <Link to="/ipd" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" /> Back to IPD</Link>

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{adm.patient?.firstName} {adm.patient?.lastName}</h1>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted"><span className="font-mono">{adm.admissionNo}</span> · {adm.patient?.uhid} · Dr. {adm.admittingDoctor?.firstName} {adm.admittingDoctor?.lastName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => downloadDischargePdf(adm.id || adm._id, adm.admissionNo).catch((e) => toast.error(e.message || 'PDF failed'))}><FileDown className="h-4 w-4" /> Summary PDF</Button>
          {active && canAdmit && (
            <>
              <Button variant="outline" onClick={() => setTransferOpen(true)}><ArrowLeftRight className="h-4 w-4" /> Transfer</Button>
              <Button onClick={() => setDischargeOpen(true)}><LogOut className="h-4 w-4" /> Discharge</Button>
            </>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="!p-4"><p className="flex items-center gap-1.5 text-xs text-muted"><BedDouble className="h-3.5 w-3.5" /> Bed</p><p className="mt-1 text-sm font-semibold">{adm.ward?.name} · {adm.room?.roomNo} · {adm.bed?.bedNo}</p></Card>
        <Card className="!p-4"><p className="flex items-center gap-1.5 text-xs text-muted"><Clock className="h-3.5 w-3.5" /> Length of Stay</p><p className="mt-1 text-lg font-semibold">{adm.lengthOfStayDays} days</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Admitted</p><p className="mt-1 text-sm font-semibold">{formatDate(adm.admissionDate)}</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Discharged</p><p className="mt-1 text-sm font-semibold">{adm.dischargeDate ? formatDate(adm.dischargeDate) : '—'}</p></Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-sm font-semibold">Clinical</h2>
          <div className="space-y-4">
            <Field label="Reason" value={adm.reason} />
            <Field label="Diagnosis" value={adm.diagnosis} />
            {adm.dischargeSummary && <Field label="Discharge Summary" value={adm.dischargeSummary} />}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><StickyNote className="h-4 w-4" /> Nursing Notes</h2>
          {active && canNurse && (
            <form onSubmit={submitNote} className="mb-4 flex gap-2">
              <input className="input flex-1" placeholder="Add a nursing note…" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button type="submit" loading={noteSaving} className="!px-3"><Send className="h-4 w-4" /></Button>
            </form>
          )}
          {adm.nursingNotes.length === 0 ? (
            <p className="text-sm text-muted">No notes yet.</p>
          ) : (
            <ul className="space-y-3">
              {[...adm.nursingNotes].reverse().map((n) => (
                <li key={n._id || n.at} className="rounded-lg border border-border p-3">
                  <p className="text-sm">{n.note}</p>
                  <p className="mt-1 text-xs text-muted">{n.by?.name || 'Staff'} · {formatDateTime(n.at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {transferOpen && <TransferModal admission={adm} onClose={() => setTransferOpen(false)} onSaved={(a) => { setAdm(a); }} />}
      {dischargeOpen && <DischargeModal admission={adm} onClose={() => setDischargeOpen(false)} onSaved={(a) => { setAdm(a); }} />}
    </div>
  );
}

function TransferModal({ admission, onClose, onSaved }) {
  const toast = useToast();
  const [beds, setBeds] = useState([]);
  const [bed, setBed] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { availableBeds().then(setBeds).catch(() => setBeds([])); }, []);
  const submit = async () => {
    if (!bed) return;
    setSaving(true);
    try { onSaved(await transferBed(admission.id || admission._id, bed)); toast.success('Bed transferred'); onClose(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };
  const options = beds.map((b) => ({ value: b.id || b._id, label: `${b.ward?.name} · Room ${b.room?.roomNo} · Bed ${b.bedNo}` }));
  return (
    <Modal open onClose={onClose} size="md" title="Transfer Bed"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={saving} disabled={!bed}>Transfer</Button></>}>
      <p className="mb-3 text-sm text-muted">Current: {admission.ward?.name} · Room {admission.room?.roomNo} · Bed {admission.bed?.bedNo}</p>
      <Select label="New Bed" placeholder={options.length ? 'Select an available bed' : 'No available beds'} options={options} value={bed} onChange={(e) => setBed(e.target.value)} />
    </Modal>
  );
}

function DischargeModal({ admission, onClose, onSaved }) {
  const toast = useToast();
  const [summary, setSummary] = useState('');
  const [icd, setIcd] = useState(admission.icdCode || '');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try { onSaved(await dischargePatient(admission.id || admission._id, { dischargeSummary: summary, icdCode: icd })); toast.success('Patient discharged'); onClose(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} size="md" title="Discharge Patient"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={saving}>Confirm Discharge</Button></>}>
      <p className="mb-3 text-sm text-muted">The bed <span className="font-medium text-fg">{admission.bed?.bedNo}</span> will be freed.</p>
      <div className="mb-3 w-40"><Input label="ICD-10 code" value={icd} onChange={(e) => setIcd(e.target.value)} placeholder="e.g. A09" /></div>
      <label className="label">Discharge Summary</label>
      <textarea rows={4} className="input resize-y" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Condition at discharge, advice, follow-up…" />
    </Modal>
  );
}
