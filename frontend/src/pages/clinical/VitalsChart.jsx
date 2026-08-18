import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { Activity, Plus } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Input from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { vitalsTrend, recordVitals } from '../../services/clinicalService.js';

// The measurements worth plotting, and the range each is normally in. The bands
// are what turn a line into a reading — a pulse of 110 means nothing to most
// people until they can see where normal ends.
const SERIES = [
  { key: 'systolic', label: 'Systolic', normal: [90, 140] },
  { key: 'diastolic', label: 'Diastolic', normal: [60, 90] },
  { key: 'pulse', label: 'Pulse', normal: [60, 100] },
  { key: 'spo2', label: 'SpO₂', normal: [94, 100] },
  { key: 'respiratoryRate', label: 'Resp. rate', normal: [12, 20] },
  { key: 'temperature', label: 'Temp °F', normal: [97.7, 99.5] },
  { key: 'bloodSugar', label: 'Blood sugar', normal: [70, 140] },
];

const BLANK = {
  systolic: '', diastolic: '', pulse: '', temperature: '', spo2: '',
  respiratoryRate: '', gcs: '', painScore: '', bloodSugar: '', weight: '', notes: '',
};

const fmtTime = (d) => new Date(d).toLocaleString('en-IN', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
});

// NEWS2 is banded rather than continuous — the number only matters through the
// action it calls for, so it is shown as that action.
function News2Badge({ score }) {
  if (score === null || score === undefined) return <span className="text-xs text-muted">—</span>;
  const tone = score >= 7 ? 'danger' : score >= 5 ? 'warning' : 'success';
  const label = score >= 7 ? 'urgent review' : score >= 5 ? 'review' : 'routine';
  return <Badge tone={tone}>NEWS2 {score} · {label}</Badge>;
}

function RecordModal({ open, encounter, patient, encounterType, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setForm(BLANK); }, [open]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const num = (v) => (v === '' ? null : Number(v));

  const submit = async (e) => {
    e.preventDefault();
    const recorded = Object.entries(form).filter(([k, v]) => k !== 'notes' && v !== '');
    if (recorded.length === 0) { toast.error('Record at least one observation'); return; }
    if (form.systolic && form.diastolic && Number(form.systolic) <= Number(form.diastolic)) {
      toast.error('Systolic must be higher than diastolic'); return;
    }

    setSaving(true);
    try {
      await recordVitals({
        patient, encounterType, encounter,
        systolic: num(form.systolic), diastolic: num(form.diastolic), pulse: num(form.pulse),
        temperature: num(form.temperature), spo2: num(form.spo2),
        respiratoryRate: num(form.respiratoryRate), gcs: num(form.gcs),
        painScore: num(form.painScore), bloodSugar: num(form.bloodSugar), weight: num(form.weight),
        notes: form.notes,
      });
      toast.success('Observations recorded'); onSaved(); onClose();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Record observations"
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" form="vitals-f" loading={saving}>Record</Button></>}>
      <form id="vitals-f" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Input label="Systolic" type="number" value={form.systolic} onChange={(e) => set('systolic', e.target.value)} />
          <Input label="Diastolic" type="number" value={form.diastolic} onChange={(e) => set('diastolic', e.target.value)} />
          <Input label="Pulse" type="number" value={form.pulse} onChange={(e) => set('pulse', e.target.value)} />
          <Input label="SpO₂ %" type="number" value={form.spo2} onChange={(e) => set('spo2', e.target.value)} />
          <Input label="Resp. rate" type="number" value={form.respiratoryRate} onChange={(e) => set('respiratoryRate', e.target.value)} />
          <Input label="Temp °F" type="number" step="0.1" value={form.temperature} onChange={(e) => set('temperature', e.target.value)} />
          <Input label="Blood sugar" type="number" value={form.bloodSugar} onChange={(e) => set('bloodSugar', e.target.value)} />
          <Input label="Weight kg" type="number" step="0.1" value={form.weight} onChange={(e) => set('weight', e.target.value)} />
          <Input label="GCS (3–15)" type="number" min="3" max="15" value={form.gcs} onChange={(e) => set('gcs', e.target.value)} />
          <Input label="Pain (0–10)" type="number" min="0" max="10" value={form.painScore} onChange={(e) => set('painScore', e.target.value)} />
        </div>
        <Input label="Notes" value={form.notes} onChange={(e) => set('notes', e.target.value)}
          placeholder="Position, oxygen delivery, anything relevant to the reading" />
        <p className="text-xs text-muted">
          Leave anything you did not measure blank — a missing reading is not a zero, and the chart
          shows the gap rather than drawing through it.
        </p>
      </form>
    </Modal>
  );
}

export default function VitalsChart({ encounter, patient, encounterType = 'IPD' }) {
  const { can } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState('systolic');
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try { setData(await vitalsTrend(encounter)); }
    catch (e) { toast.error(e.message); setData({ points: [], latest: null }); }
  }, [encounter, toast]);

  useEffect(() => { load(); }, [load]);

  const series = SERIES.find((s) => s.key === selected);

  const chartData = useMemo(
    () => (data?.points || []).map((p) => ({ at: fmtTime(p.at), value: p[selected] })),
    [data, selected]
  );

  if (!data) return <ListSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4" /> Observations
          </h3>
          {data.latest && <News2Badge score={data.latest.news2} />}
        </div>
        {can('clinical:vitals') && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Record
          </Button>
        )}
      </div>

      {data.points.length === 0 ? (
        <Card><EmptyState icon={Activity} title="No observations yet" description="Record the first set to start the chart." /></Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {SERIES.map((s) => (
              <button
                key={s.key}
                onClick={() => setSelected(s.key)}
                className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                  selected === s.key ? 'border-fg font-medium' : 'border-border text-muted hover:text-fg'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <Card className="!p-3">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
                  <XAxis dataKey="at" tick={{ fontSize: 10 }} stroke="rgb(var(--muted))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="rgb(var(--muted))" domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{
                    background: 'rgb(var(--elevated))', border: '1px solid rgb(var(--border))',
                    borderRadius: 12, color: 'rgb(var(--fg))', fontSize: 12,
                  }} />
                  {/* The normal range, so a value can be read as high or low
                      rather than just as a number. */}
                  {series?.normal && (
                    <>
                      <ReferenceLine y={series.normal[0]} stroke="rgb(var(--muted))" strokeDasharray="4 4" />
                      <ReferenceLine y={series.normal[1]} stroke="rgb(var(--muted))" strokeDasharray="4 4" />
                    </>
                  )}
                  {/* connectNulls stays off on purpose: a gap in the
                      observations is information, and joining across it would
                      draw a line nobody measured. */}
                  <Line type="monotone" dataKey="value" stroke="rgb(var(--accent))" strokeWidth={2}
                    dot={{ r: 3 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="!p-0">
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">BP</th>
                    <th className="px-3 py-2 font-medium">Pulse</th>
                    <th className="px-3 py-2 font-medium">SpO₂</th>
                    <th className="px-3 py-2 font-medium">Temp</th>
                    <th className="px-3 py-2 font-medium">NEWS2</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.points].reverse().map((p, i) => (
                    <tr key={i} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 text-muted">{fmtTime(p.at)}</td>
                      <td className="px-3 py-2 tabular-nums">{p.systolic && p.diastolic ? `${p.systolic}/${p.diastolic}` : '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{p.pulse ?? '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{p.spo2 ?? '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{p.temperature ?? '—'}</td>
                      <td className="px-3 py-2"><News2Badge score={p.news2} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <RecordModal open={open} encounter={encounter} patient={patient} encounterType={encounterType}
        onClose={() => setOpen(false)} onSaved={load} />
    </div>
  );
}
