import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Button from '../../components/ui/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { dispose } from '../../services/emergencyService.js';
import { activeDepartments } from '../../services/departmentService.js';
import { availableBeds } from '../../services/facilityService.js';

const OUTCOMES = [
  { value: 'DISCHARGED', label: 'Discharged' },
  { value: 'ADMITTED', label: 'Admitted to ward' },
  { value: 'REFERRED', label: 'Referred out' },
  { value: 'LAMA', label: 'Left against medical advice' },
  { value: 'ABSCONDED', label: 'Absconded' },
  { value: 'DIED', label: 'Died' },
];

export default function DispositionModal({ visit, onClose, onSaved }) {
  const toast = useToast();
  const [outcome, setOutcome] = useState('DISCHARGED');
  const [notes, setNotes] = useState('');
  const [referredTo, setReferredTo] = useState('');
  const [department, setDepartment] = useState('');
  const [bed, setBed] = useState('');
  const [departments, setDepartments] = useState([]);
  const [beds, setBeds] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visit) return;
    setOutcome('DISCHARGED'); setNotes(''); setReferredTo(''); setDepartment(''); setBed('');
  }, [visit]);

  // Only fetched when they are actually needed — most visits end in a
  // discharge and never touch a ward list.
  useEffect(() => {
    if (outcome !== 'ADMITTED') return;
    activeDepartments().then(setDepartments).catch(() => setDepartments([]));
    availableBeds().then(setBeds).catch(() => setBeds([]));
  }, [outcome]);

  const submit = async (e) => {
    e.preventDefault();
    if (outcome === 'ADMITTED' && (!department || !bed)) {
      toast.error('Admitting needs a department and a free bed'); return;
    }
    if (outcome === 'REFERRED' && !referredTo.trim()) {
      toast.error('Say where the patient is being referred to'); return;
    }

    setSaving(true);
    try {
      await dispose(visit._id || visit.id, {
        disposition: outcome,
        notes: notes.trim() || undefined,
        referredTo: referredTo.trim() || undefined,
        department: department || undefined,
        bed: bed || undefined,
      });
      toast.success(outcome === 'ADMITTED' ? 'Admitted to ward' : 'Visit closed');
      onSaved(); onClose();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const unidentified = visit && !visit.patient;

  return (
    <Modal open={!!visit} onClose={onClose} size="md"
      title={visit ? `Close visit · ${visit.displayName}` : ''}
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" form="er-dispose" loading={saving}>Close visit</Button></>}>
      <form id="er-dispose" onSubmit={submit} className="space-y-4">
        <Select label="Outcome *" value={outcome} onChange={(e) => setOutcome(e.target.value)} options={OUTCOMES} />

        {outcome === 'ADMITTED' && unidentified && (
          <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted">
            This patient has not been identified yet. Attach a patient record before admitting —
            a ward admission has to belong to somebody.
          </p>
        )}

        {outcome === 'ADMITTED' && !unidentified && (
          <div className="grid grid-cols-2 gap-3">
            <Select label="Department *" value={department} onChange={(e) => setDepartment(e.target.value)}
              placeholder="Select" options={departments.map((d) => ({ value: d.id || d._id, label: d.name }))} />
            <Select label="Bed *" value={bed} onChange={(e) => setBed(e.target.value)}
              placeholder="Select a free bed"
              options={beds.map((b) => ({ value: b.id || b._id, label: `${b.bedNo} · ${b.ward?.name || ''}` }))} />
          </div>
        )}

        {outcome === 'REFERRED' && (
          <Input label="Referred to *" value={referredTo} onChange={(e) => setReferredTo(e.target.value)}
            placeholder="Facility name" />
        )}

        <div>
          <label className="label">Notes</label>
          <textarea rows={3} className="input resize-y" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Advice given, follow-up, condition on leaving…" />
        </div>
      </form>
    </Modal>
  );
}
