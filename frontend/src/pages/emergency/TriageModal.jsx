import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import Input from '../../components/ui/Input.jsx';
import Button from '../../components/ui/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { triage } from '../../services/emergencyService.js';

const LEVEL_STYLE = {
  1: 'bg-red-600 text-white border-red-600',
  2: 'bg-orange-500 text-white border-orange-500',
  3: 'bg-yellow-400 text-black border-yellow-400',
  4: 'bg-green-600 text-white border-green-600',
  5: 'bg-blue-600 text-white border-blue-600',
};

const BLANK = { bp: '', pulse: '', temperature: '', spo2: '', respiratoryRate: '', gcs: '', painScore: '' };

export default function TriageModal({ visit, scale, onClose, onSaved }) {
  const toast = useToast();
  const [level, setLevel] = useState(null);
  const [vitals, setVitals] = useState(BLANK);
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const isRetriage = !!visit?.triageLevel;

  useEffect(() => {
    if (!visit) return;
    setLevel(visit.triageLevel ?? null);
    setVitals({ ...BLANK, ...Object.fromEntries(Object.entries(visit.triageVitals || {}).map(([k, v]) => [k, v ?? ''])) });
    setNotes(visit.triageNotes || '');
    setReason('');
  }, [visit]);

  const setV = (k, v) => setVitals((s) => ({ ...s, [k]: v }));
  const num = (v) => (v === '' ? null : Number(v));

  const submit = async (e) => {
    e.preventDefault();
    if (!level) { toast.error('Pick an acuity level'); return; }
    setSaving(true);
    try {
      await triage(visit._id || visit.id, {
        level,
        vitals: {
          bp: vitals.bp,
          pulse: num(vitals.pulse),
          temperature: num(vitals.temperature),
          spo2: num(vitals.spo2),
          respiratoryRate: num(vitals.respiratoryRate),
          gcs: num(vitals.gcs),
          painScore: num(vitals.painScore),
        },
        notes,
        reason: reason.trim() || undefined,
      });
      toast.success(isRetriage ? 'Re-triaged' : 'Triage recorded');
      onSaved(); onClose();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  return (
    <Modal open={!!visit} onClose={onClose} size="lg"
      title={visit ? `${isRetriage ? 'Re-triage' : 'Triage'} · ${visit.displayName}` : ''}
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" form="er-triage" loading={saving}>Save</Button></>}>
      <form id="er-triage" onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Acuity *</label>
          <div className="grid grid-cols-5 gap-2">
            {scale.map((s) => (
              <button
                key={s.level}
                type="button"
                onClick={() => setLevel(s.level)}
                className={`rounded-lg border p-2 text-center transition ${
                  level === s.level ? LEVEL_STYLE[s.level] : 'border-border text-muted hover:border-fg'
                }`}
              >
                <div className="text-lg font-bold">{s.level}</div>
                <div className="text-[10px] leading-tight">{s.label}</div>
                <div className="text-[10px] opacity-80">{s.targetMinutes}m</div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Input label="BP" value={vitals.bp} onChange={(e) => setV('bp', e.target.value)} placeholder="120/80" />
          <Input label="Pulse" type="number" value={vitals.pulse} onChange={(e) => setV('pulse', e.target.value)} />
          <Input label="SpO₂ %" type="number" value={vitals.spo2} onChange={(e) => setV('spo2', e.target.value)} />
          <Input label="Resp. rate" type="number" value={vitals.respiratoryRate} onChange={(e) => setV('respiratoryRate', e.target.value)} />
          <Input label="Temp °F" type="number" step="0.1" value={vitals.temperature} onChange={(e) => setV('temperature', e.target.value)} />
          {/* GCS runs 3–15 by definition; anything outside is a typo. */}
          <Input label="GCS (3–15)" type="number" min="3" max="15" value={vitals.gcs} onChange={(e) => setV('gcs', e.target.value)} />
          <Input label="Pain (0–10)" type="number" min="0" max="10" value={vitals.painScore} onChange={(e) => setV('painScore', e.target.value)} />
        </div>

        <div>
          <label className="label">Triage notes</label>
          <textarea rows={2} className="input resize-y" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Presentation, mechanism of injury, relevant history…" />
        </div>

        {isRetriage && (
          <Input
            label="Reason for re-triage"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Collapsed in the waiting area"
          />
        )}
        {isRetriage && (
          <p className="text-xs text-muted">
            The original assessment is kept — a re-triage is added to the history rather than
            replacing it, and the waiting clock still runs from arrival.
          </p>
        )}
      </form>
    </Modal>
  );
}
