import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, CheckCircle2, XCircle, Plus, Trash2, Activity, Pill, AlertTriangle, FileDown, History, BookmarkPlus, BedDouble, FlaskConical, Scan, ShoppingCart } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import AppointmentForm from '../appointments/AppointmentForm.jsx';
import AdmitForm from '../ipd/AdmitForm.jsx';
import NewLabOrder from '../laboratory/NewLabOrder.jsx';
import NewRadOrder from '../radiology/NewRadOrder.jsx';
import DispenseModal from '../pharmacy/DispenseModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getVisit, updateVisit, listVisits, downloadPrescriptionPdf, checkAllergies } from '../../services/opdService.js';
import { CAN_OPD_EDIT, CAN_IPD_ADMIT, CAN_LAB_ORDER, CAN_RAD_ORDER, CAN_PHARMACY_MANAGE, OPD_STATUS_META, MED_ROUTE_OPTIONS, toDateInput, formatDate } from '../../utils/constants.js';

const VITAL_FIELDS = [
  { key: 'bp', label: 'BP', ph: '120/80', type: 'text' },
  { key: 'pulse', label: 'Pulse', ph: 'bpm', type: 'number' },
  { key: 'temperature', label: 'Temp °F', ph: '98.6', type: 'number' },
  { key: 'spo2', label: 'SpO₂ %', ph: '98', type: 'number' },
  { key: 'weight', label: 'Weight kg', ph: '70', type: 'number' },
  { key: 'height', label: 'Height cm', ph: '170', type: 'number' },
  { key: 'respiratoryRate', label: 'Resp rate', ph: '16', type: 'number' },
];
const EMPTY_MED = { medicine: '', dosage: '', frequency: '', duration: '', route: 'ORAL', instructions: '', quantity: '' };

// Flags a vital that's outside a clinically notable range — non-blocking,
// just calls it out visually so it isn't missed (or a typo isn't glossed over).
function vitalWarning(key, raw) {
  if (raw === '' || raw == null) return null;
  if (key === 'bp') {
    const m = /^(\d{2,3})\s*\/\s*(\d{2,3})$/.exec(String(raw).trim());
    if (!m) return null;
    const sys = Number(m[1]); const dia = Number(m[2]);
    return (sys >= 180 || sys < 90 || dia >= 120 || dia < 60) ? 'Abnormal BP' : null;
  }
  const v = Number(raw);
  if (!Number.isFinite(v)) return null;
  switch (key) {
    case 'pulse': return v < 50 ? 'Low pulse' : v > 120 ? 'High pulse' : null;
    case 'temperature': return v >= 100.4 ? 'Fever' : v < 95 ? 'Low temp' : null;
    case 'spo2': return v < 92 ? 'Low SpO₂' : null;
    case 'respiratoryRate': return v < 10 ? 'Low resp. rate' : v > 24 ? 'High resp. rate' : null;
    default: return null;
  }
}

// Prescription templates are saved per-browser (localStorage) — a quick way
// to reuse common medicine sets without a backend model.
const TEMPLATES_KEY = 'hms-opd-prescription-templates';
function loadTemplates() {
  try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '[]'); } catch { return []; }
}
function saveTemplatesToStorage(list) {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(list));
}

export default function OpdConsultation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const toast = useToast();
  const canEdit = CAN_OPD_EDIT.includes(role);
  const canAdmit = CAN_IPD_ADMIT.includes(role);
  const canOrderLab = CAN_LAB_ORDER.includes(role);
  const canOrderRad = CAN_RAD_ORDER.includes(role);
  const canDispense = CAN_PHARMACY_MANAGE.includes(role);

  const [visit, setVisit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [vitals, setVitals] = useState({});
  const [symptoms, setSymptoms] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [icd, setIcd] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [meds, setMeds] = useState([]);
  const [followUp, setFollowUp] = useState('');
  const [allergyWarnings, setAllergyWarnings] = useState([]);
  const [suggestFollowUp, setSuggestFollowUp] = useState(false);
  const [bookFollowUpOpen, setBookFollowUpOpen] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [pastVisits, setPastVisits] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [templateName, setTemplateName] = useState('');
  const [admitOpen, setAdmitOpen] = useState(false);
  const [labOrderOpen, setLabOrderOpen] = useState(false);
  const [radOrderOpen, setRadOrderOpen] = useState(false);
  const [dispenseOpen, setDispenseOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const v = await getVisit(id);
      setVisit(v);
      setVitals(v.vitals || {});
      setSymptoms(v.symptoms || '');
      setDiagnosis(v.diagnosis || '');
      setIcd(v.icdCode || '');
      setClinicalNotes(v.clinicalNotes || '');
      setMeds((v.prescription || []).map((m) => ({ ...EMPTY_MED, ...m })));
      setFollowUp(toDateInput(v.followUpDate));

      const pid = v.patient?.id || v.patient?._id;
      if (pid) {
        listVisits({ patient: pid, limit: 5 })
          .then((r) => setPastVisits(r.items.filter((pv) => (pv.id || pv._id) !== id).slice(0, 3)))
          .catch(() => setPastVisits([]));
      }
    } catch (err) {
      toast.error(err.message || 'Visit not found');
      navigate('/opd');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => { setTemplates(loadTemplates()); }, []);

  // Live drug-allergy check as medicines are edited (debounced).
  useEffect(() => {
    const names = meds.map((m) => m.medicine).filter(Boolean);
    const pid = visit?.patient?._id || visit?.patient?.id;
    if (!pid || names.length === 0) { setAllergyWarnings([]); return undefined; }
    const t = setTimeout(() => {
      checkAllergies(pid, names).then((r) => setAllergyWarnings(r.warnings || [])).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [meds, visit]);

  if (loading) return <Spinner full />;
  if (!visit) return null;

  const locked = visit.status !== 'OPEN' || !canEdit;
  const meta = OPD_STATUS_META[visit.status] || { label: visit.status, tone: 'neutral' };

  const payload = () => ({
    vitals: {
      bp: vitals.bp || '',
      pulse: vitals.pulse === '' ? null : vitals.pulse,
      temperature: vitals.temperature === '' ? null : vitals.temperature,
      spo2: vitals.spo2 === '' ? null : vitals.spo2,
      weight: vitals.weight === '' ? null : vitals.weight,
      height: vitals.height === '' ? null : vitals.height,
      respiratoryRate: vitals.respiratoryRate === '' ? null : vitals.respiratoryRate,
    },
    symptoms, diagnosis, icdCode: icd, clinicalNotes,
    prescription: meds
      .filter((m) => m.medicine.trim())
      .map((m) => ({ ...m, quantity: m.quantity === '' ? 0 : Number(m.quantity) })),
    followUpDate: followUp || null,
  });

  const save = async (complete = false) => {
    setSaving(true);
    try {
      const body = payload();
      if (complete) body.status = 'COMPLETED';
      const updated = await updateVisit(id, body);
      setVisit(updated);
      toast.success(complete ? 'Visit completed' : 'Saved');
      if (complete) {
        load();
        if (body.followUpDate) setSuggestFollowUp(true);
      }
    } catch (err) {
      toast.error(err.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const setMed = (i, key, val) => setMeds((prev) => prev.map((m, idx) => (idx === i ? { ...m, [key]: val } : m)));

  const saveAsTemplate = () => {
    const name = templateName.trim();
    if (!name) { toast.error('Enter a template name'); return; }
    const cleaned = meds.filter((m) => m.medicine.trim());
    if (cleaned.length === 0) { toast.error('Add at least one medicine first'); return; }
    const next = [...templates.filter((t) => t.name !== name), { name, meds: cleaned }];
    saveTemplatesToStorage(next);
    setTemplates(next);
    setTemplateName('');
    toast.success(`Template "${name}" saved`);
  };

  const loadTemplate = (name) => {
    const t = templates.find((x) => x.name === name);
    if (!t) return;
    setMeds((prev) => [...prev, ...t.meds.map((m) => ({ ...EMPTY_MED, ...m }))]);
    toast.success(`Added ${t.meds.length} medicine(s) from "${name}"`);
  };

  const deleteTemplate = (name) => {
    const next = templates.filter((t) => t.name !== name);
    saveTemplatesToStorage(next);
    setTemplates(next);
  };

  const cancelVisit = async () => {
    setCancelling(true);
    try {
      const updated = await updateVisit(id, { status: 'CANCELLED' });
      setVisit(updated);
      toast.success('Visit cancelled');
      setCancelConfirm(false);
    } catch (err) {
      toast.error(err.message || 'Could not cancel visit');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-5">
      <Link to="/opd" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" /> Back to OPD</Link>

      {/* Header */}
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{visit.patient?.firstName} {visit.patient?.lastName}</h1>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted">
            <span className="font-mono">{visit.visitNo}</span> · {visit.patient?.uhid} · Dr. {visit.doctor?.firstName} {visit.doctor?.lastName} · {formatDate(visit.visitDate)}
          </p>
          {visit.patient?.allergies && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-2 py-1 text-xs text-red-500">
              <AlertTriangle className="h-3.5 w-3.5" /> Allergies: {visit.patient.allergies}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadPrescriptionPdf(visit.id || visit._id, visit.visitNo).catch((e) => toast.error(e.message || 'PDF failed'))}><FileDown className="h-4 w-4" /> Prescription</Button>
          {!locked && (
            <>
              {canOrderLab && (
                <Button variant="outline" onClick={() => setLabOrderOpen(true)}><FlaskConical className="h-4 w-4" /> Order Lab Test</Button>
              )}
              {canOrderRad && (
                <Button variant="outline" onClick={() => setRadOrderOpen(true)}><Scan className="h-4 w-4" /> Order Radiology</Button>
              )}
              {canDispense && (
                <Button variant="outline" onClick={() => setDispenseOpen(true)}><ShoppingCart className="h-4 w-4" /> Dispense Medicine</Button>
              )}
              {canAdmit && (
                <Button variant="outline" onClick={() => setAdmitOpen(true)}><BedDouble className="h-4 w-4" /> Admit to IPD</Button>
              )}
              <Button variant="outline" className="!border-red-500/40 !text-red-500 hover:!bg-red-500/10" onClick={() => setCancelConfirm(true)} disabled={saving || cancelling}>
                <XCircle className="h-4 w-4" /> Cancel Visit
              </Button>
              <Button variant="outline" onClick={() => save(false)} loading={saving}><Save className="h-4 w-4" /> Save</Button>
              <Button onClick={() => save(true)} loading={saving}><CheckCircle2 className="h-4 w-4" /> Complete</Button>
            </>
          )}
        </div>
      </Card>

      {locked && visit.status !== 'OPEN' && (
        <p className="text-sm text-muted">This visit is {visit.status.toLowerCase()} and read-only.</p>
      )}

      {/* Vitals */}
      <Card>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4" /> Vitals</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {VITAL_FIELDS.map((f) => (
            <Input key={f.key} label={f.label} type={f.type} placeholder={f.ph} disabled={locked}
              value={vitals[f.key] ?? ''} onChange={(e) => setVitals((v) => ({ ...v, [f.key]: e.target.value }))}
              error={vitalWarning(f.key, vitals[f.key])} />
          ))}
        </div>
      </Card>

      {/* Recent vitals trend */}
      {pastVisits.length > 0 && (
        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" /> Recent Vitals</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">BP</th>
                  <th className="py-2 pr-4 font-medium">Pulse</th>
                  <th className="py-2 pr-4 font-medium">Weight</th>
                  <th className="py-2 pr-4 font-medium">Temp</th>
                </tr>
              </thead>
              <tbody>
                {pastVisits.map((pv) => (
                  <tr key={pv.id || pv._id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4 text-muted">{formatDate(pv.visitDate)}</td>
                    <td className="py-2 pr-4 tabular-nums">{pv.vitals?.bp || '—'}</td>
                    <td className="py-2 pr-4 tabular-nums">{pv.vitals?.pulse ?? '—'}</td>
                    <td className="py-2 pr-4 tabular-nums">{pv.vitals?.weight ?? '—'} {pv.vitals?.weight ? 'kg' : ''}</td>
                    <td className="py-2 pr-4 tabular-nums">{pv.vitals?.temperature ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Clinical */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Symptoms</h2>
          <textarea rows={4} className="input resize-y" disabled={locked} value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder="Presenting complaints…" />
        </Card>
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Diagnosis</h2>
            <div className="w-32"><Input placeholder="ICD-10" disabled={locked} value={icd} onChange={(e) => setIcd(e.target.value)} /></div>
          </div>
          <textarea rows={4} className="input resize-y" disabled={locked} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Provisional / final diagnosis…" />
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">Clinical Notes</h2>
          <textarea rows={3} className="input resize-y" disabled={locked} value={clinicalNotes} onChange={(e) => setClinicalNotes(e.target.value)} placeholder="Examination findings, advice…" />
        </Card>
      </div>

      {/* Prescription */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Pill className="h-4 w-4" /> Prescription</h2>
          {!locked && (
            <div className="flex flex-wrap items-center gap-2">
              {templates.length > 0 && (
                <div className="w-48">
                  <Select
                    placeholder="Load template…"
                    options={templates.map((t) => ({ value: t.name, label: `${t.name} (${t.meds.length})` }))}
                    value=""
                    onChange={(e) => { if (e.target.value) loadTemplate(e.target.value); }}
                  />
                </div>
              )}
              <Button variant="outline" className="h-8" onClick={() => setMeds((m) => [...m, { ...EMPTY_MED }])}><Plus className="h-4 w-4" /> Add Medicine</Button>
            </div>
          )}
        </div>
        {!locked && meds.some((m) => m.medicine.trim()) && (
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border bg-surface p-3">
            <div className="flex-1 min-w-[160px]">
              <Input label="Save current list as template" placeholder="e.g. Common Cold" value={templateName}
                onChange={(e) => setTemplateName(e.target.value)} />
            </div>
            <Button variant="outline" className="h-9" onClick={saveAsTemplate}><BookmarkPlus className="h-4 w-4" /> Save as Template</Button>
          </div>
        )}
        {templates.length > 0 && !locked && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <span key={t.name} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs">
                {t.name}
                <button onClick={() => deleteTemplate(t.name)} className="text-muted hover:text-red-500" title={`Delete "${t.name}"`}>
                  <XCircle className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {allergyWarnings.length > 0 && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Allergy alert</p>
              <ul className="mt-0.5 list-disc pl-4">
                {allergyWarnings.map((w, i) => <li key={i}><span className="font-medium">{w.medicine}</span> — patient is allergic to “{w.allergy}”</li>)}
              </ul>
            </div>
          </div>
        )}
        {meds.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">No medicines added.</p>
        ) : (
          <div className="space-y-3">
            {meds.map((m, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3 sm:grid-cols-12">
                <Input className="sm:col-span-3" placeholder="Medicine *" disabled={locked} value={m.medicine} onChange={(e) => setMed(i, 'medicine', e.target.value)} />
                <Input className="sm:col-span-2" placeholder="Dosage" disabled={locked} value={m.dosage} onChange={(e) => setMed(i, 'dosage', e.target.value)} />
                <Input className="sm:col-span-2" placeholder="1-0-1" disabled={locked} value={m.frequency} onChange={(e) => setMed(i, 'frequency', e.target.value)} />
                <Input className="sm:col-span-2" placeholder="5 days" disabled={locked} value={m.duration} onChange={(e) => setMed(i, 'duration', e.target.value)} />
                <Select className="sm:col-span-2" options={MED_ROUTE_OPTIONS} disabled={locked} value={m.route} onChange={(e) => setMed(i, 'route', e.target.value)} />
                {!locked && (
                  <button onClick={() => setMeds((prev) => prev.filter((_, idx) => idx !== i))} className="btn-ghost h-9 w-9 !p-0 text-red-500 hover:bg-red-500/10 sm:col-span-1" title="Remove"><Trash2 className="h-4 w-4" /></button>
                )}
                <Input className="sm:col-span-12" placeholder="Instructions (e.g. After food)" disabled={locked} value={m.instructions} onChange={(e) => setMed(i, 'instructions', e.target.value)} />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Follow-up */}
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full sm:w-56">
            <Input type="date" label="Follow-up Date" disabled={locked} value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
          </div>
          {!locked && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => save(false)} loading={saving}><Save className="h-4 w-4" /> Save</Button>
              <Button onClick={() => save(true)} loading={saving}><CheckCircle2 className="h-4 w-4" /> Complete Visit</Button>
            </div>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={cancelConfirm}
        onClose={() => setCancelConfirm(false)}
        onConfirm={cancelVisit}
        loading={cancelling}
        title="Cancel this visit?"
        confirmLabel="Cancel Visit"
        message="This will mark the visit as cancelled and lock it from further edits. This cannot be undone."
      />
      <ConfirmDialog
        open={suggestFollowUp}
        onClose={() => setSuggestFollowUp(false)}
        onConfirm={() => { setSuggestFollowUp(false); setBookFollowUpOpen(true); }}
        danger={false}
        title="Book the follow-up now?"
        confirmLabel="Book appointment"
        message={`A follow-up was noted for ${formatDate(followUp)}. Book that appointment now with the same doctor?`}
      />
      <AppointmentForm
        open={bookFollowUpOpen}
        onClose={() => setBookFollowUpOpen(false)}
        onSaved={() => {}}
        presetPatient={visit.patient}
        presetDoctor={visit.doctor?.id || visit.doctor?._id}
        presetDepartment={visit.department?.id || visit.department?._id}
        presetDate={followUp}
      />
      <AdmitForm
        open={admitOpen}
        onClose={() => setAdmitOpen(false)}
        onSaved={(a) => { toast.success(`Admitted · ${a.admissionNo}`); navigate(`/ipd/${a.id || a._id}`); }}
        presetPatient={visit.patient}
        presetDoctor={visit.doctor?.id || visit.doctor?._id}
        presetDepartment={visit.department?.id || visit.department?._id}
        presetDiagnosis={diagnosis}
      />
      <NewLabOrder
        open={labOrderOpen}
        onClose={() => setLabOrderOpen(false)}
        onCreated={(o) => toast.success(`Lab order created · ${o.orderNo}`)}
        presetPatient={visit.patient}
        presetDoctor={visit.doctor?.id || visit.doctor?._id}
        presetOpdVisit={visit.id || visit._id}
      />
      <NewRadOrder
        open={radOrderOpen}
        onClose={() => setRadOrderOpen(false)}
        onCreated={(o) => toast.success(`Radiology order created · ${o.orderNo}`)}
        presetPatient={visit.patient}
        presetDoctor={visit.doctor?.id || visit.doctor?._id}
        presetOpdVisit={visit.id || visit._id}
      />
      <DispenseModal
        open={dispenseOpen}
        onClose={() => setDispenseOpen(false)}
        onDone={() => toast.success('Medicines dispensed')}
        presetPatient={visit.patient}
        presetDoctor={visit.doctor?.id || visit.doctor?._id}
        presetOpdVisit={visit.id || visit._id}
        presetPrescription={visit.prescription}
      />
    </div>
  );
}
