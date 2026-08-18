import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Button from '../../components/ui/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import PatientPicker from '../appointments/PatientPicker.jsx';
import { registerArrival } from '../../services/emergencyService.js';

const ARRIVAL_MODES = [
  { value: 'WALK_IN', label: 'Walk-in' },
  { value: 'AMBULANCE', label: 'Ambulance' },
  { value: 'POLICE', label: 'Police' },
  { value: 'REFERRED', label: 'Referred' },
  { value: 'OTHER', label: 'Other' },
];

export default function ArrivalModal({ open, scale, onClose, onSaved }) {
  const toast = useToast();

  // The identity question is the first thing asked, because it changes the
  // whole form — an unconscious patient has no record to look up.
  const [known, setKnown] = useState(true);
  const [patient, setPatient] = useState(null);
  const [unknown, setUnknown] = useState({ gender: 'UNKNOWN', estimatedAge: '', identifyingMarks: '', broughtBy: '' });
  const [complaint, setComplaint] = useState('');
  const [mode, setMode] = useState('WALK_IN');
  const [level, setLevel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKnown(true); setPatient(null);
    setUnknown({ gender: 'UNKNOWN', estimatedAge: '', identifyingMarks: '', broughtBy: '' });
    setComplaint(''); setMode('WALK_IN'); setLevel('');
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!complaint.trim()) { toast.error('Chief complaint is required'); return; }
    if (known && !patient) { toast.error('Pick a patient, or register as unidentified'); return; }

    setSaving(true);
    try {
      await registerArrival({
        patient: known ? (patient.id || patient._id) : null,
        unidentified: known ? null : {
          ...unknown,
          estimatedAge: unknown.estimatedAge === '' ? null : Number(unknown.estimatedAge),
        },
        chiefComplaint: complaint.trim(),
        arrivalMode: mode,
        triageLevel: level === '' ? null : Number(level),
      });
      toast.success('Arrival registered'); onSaved(); onClose();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Register arrival"
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" form="er-arrival" loading={saving}>Register</Button></>}>
      <form id="er-arrival" onSubmit={submit} className="space-y-4">
        <div className="flex gap-2">
          <button type="button" onClick={() => setKnown(true)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${known ? 'border-fg font-medium' : 'border-border text-muted'}`}>
            Known patient
          </button>
          <button type="button" onClick={() => setKnown(false)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${!known ? 'border-fg font-medium' : 'border-border text-muted'}`}>
            Unidentified
          </button>
        </div>

        {known ? (
          <PatientPicker value={patient} onChange={setPatient} />
        ) : (
          <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
            <p className="text-xs text-muted">
              A chart opens straight away and gets a temporary alias. Attach the real patient
              record later, from the visit — nothing clinical changes when you do.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Apparent gender" value={unknown.gender}
                onChange={(e) => setUnknown((u) => ({ ...u, gender: e.target.value }))}
                options={[
                  { value: 'UNKNOWN', label: 'Unknown' }, { value: 'MALE', label: 'Male' },
                  { value: 'FEMALE', label: 'Female' }, { value: 'OTHER', label: 'Other' },
                ]} />
              <Input label="Estimated age" type="number" value={unknown.estimatedAge}
                onChange={(e) => setUnknown((u) => ({ ...u, estimatedAge: e.target.value }))} placeholder="40" />
            </div>
            <Input label="Identifying marks" value={unknown.identifyingMarks}
              onChange={(e) => setUnknown((u) => ({ ...u, identifyingMarks: e.target.value }))}
              placeholder="Scar on left forearm, blue shirt" />
            <Input label="Brought by" value={unknown.broughtBy}
              onChange={(e) => setUnknown((u) => ({ ...u, broughtBy: e.target.value }))}
              placeholder="Police / passer-by / ambulance crew" />
          </div>
        )}

        <Input label="Chief complaint *" value={complaint} onChange={(e) => setComplaint(e.target.value)}
          placeholder="Chest pain, road traffic accident, breathlessness…" />

        <div className="grid grid-cols-2 gap-3">
          <Select label="Arrival mode" value={mode} onChange={(e) => setMode(e.target.value)} options={ARRIVAL_MODES} />
          <Select label="Triage now (optional)" value={level} onChange={(e) => setLevel(e.target.value)}
            placeholder="Triage at the desk"
            options={scale.map((s) => ({ value: String(s.level), label: `${s.level} · ${s.label} (${s.targetMinutes}m)` }))} />
        </div>
        <p className="text-xs text-muted">
          Leave triage blank if the nurse will assess separately — an untriaged patient sits at the
          top of the board until somebody does.
        </p>
      </form>
    </Modal>
  );
}
