import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, CheckCircle2, Plus, Trash2, Activity, Pill, AlertTriangle, FileDown } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getVisit, updateVisit, downloadPrescriptionPdf, checkAllergies } from '../../services/opdService.js';
import { CAN_OPD_EDIT, OPD_STATUS_META, MED_ROUTE_OPTIONS, toDateInput, formatDate } from '../../utils/constants.js';

const VITAL_FIELDS = [
  { key: 'bp', label: 'BP', ph: '120/80', type: 'text' },
  { key: 'pulse', label: 'Pulse', ph: 'bpm', type: 'number' },
  { key: 'temperature', label: 'Temp °F', ph: '98.6', type: 'number' },
  { key: 'spo2', label: 'SpO₂ %', ph: '98', type: 'number' },
  { key: 'weight', label: 'Weight kg', ph: '70', type: 'number' },
  { key: 'respiratoryRate', label: 'Resp rate', ph: '16', type: 'number' },
];
const EMPTY_MED = { medicine: '', dosage: '', frequency: '', duration: '', route: 'ORAL', instructions: '', quantity: '' };

export default function OpdConsultation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const toast = useToast();
  const canEdit = CAN_OPD_EDIT.includes(role);

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
    } catch (err) {
      toast.error(err.message || 'Visit not found');
      navigate('/opd');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

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
      if (complete) load();
    } catch (err) {
      toast.error(err.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const setMed = (i, key, val) => setMeds((prev) => prev.map((m, idx) => (idx === i ? { ...m, [key]: val } : m)));

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
              <Button variant="outline" onClick={() => save(false)} loading={saving}><Save className="h-4 w-4" /> Save</Button>
              <Button onClick={() => save(true)} loading={saving}><CheckCircle2 className="h-4 w-4" /> Complete</Button>
            </>
          )}
        </div>
      </Card>

      {locked && visit.status === 'COMPLETED' && (
        <p className="text-sm text-muted">This visit is completed and read-only.</p>
      )}

      {/* Vitals */}
      <Card>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4" /> Vitals</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {VITAL_FIELDS.map((f) => (
            <Input key={f.key} label={f.label} type={f.type} placeholder={f.ph} disabled={locked}
              value={vitals[f.key] ?? ''} onChange={(e) => setVitals((v) => ({ ...v, [f.key]: e.target.value }))} />
          ))}
        </div>
      </Card>

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
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Pill className="h-4 w-4" /> Prescription</h2>
          {!locked && <Button variant="outline" className="h-8" onClick={() => setMeds((m) => [...m, { ...EMPTY_MED }])}><Plus className="h-4 w-4" /> Add Medicine</Button>}
        </div>
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
    </div>
  );
}
