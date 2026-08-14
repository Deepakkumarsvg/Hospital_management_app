import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../../components/ui/Modal.jsx';
import Select from '../../components/ui/Select.jsx';
import Input from '../../components/ui/Input.jsx';
import Button from '../../components/ui/Button.jsx';
import PatientPicker from '../appointments/PatientPicker.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { activeMedicines, dispenseMedicines } from '../../services/pharmacyService.js';

export default function DispenseModal({ open, onClose, onDone, presetPatient }) {
  const toast = useToast();
  const [meds, setMeds] = useState([]);
  const [patient, setPatient] = useState(null);
  const [rows, setRows] = useState([{ medicine: '', quantity: 1 }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    activeMedicines().then(setMeds).catch(() => setMeds([]));
    setPatient(presetPatient || null); setRows([{ medicine: '', quantity: 1 }]); setError('');
  }, [open, presetPatient]);

  const medById = Object.fromEntries(meds.map((m) => [m.id || m._id, m]));
  const options = meds.map((m) => ({ value: m.id || m._id, label: `${m.name} · stock ${m.currentStock} · ₹${m.sellingPrice}` }));
  const setRow = (i, k, v) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const total = rows.reduce((s, r) => s + ((medById[r.medicine]?.sellingPrice || 0) * (Number(r.quantity) || 0)), 0);

  const submit = async (e) => {
    e.preventDefault();
    const items = rows.filter((r) => r.medicine && Number(r.quantity) > 0).map((r) => ({ medicine: r.medicine, quantity: Number(r.quantity) }));
    if (items.length === 0) { setError('Add at least one medicine'); return; }
    setSaving(true);
    try {
      const rec = await dispenseMedicines({ patient: patient ? (patient.id || patient._id) : null, items });
      toast.success(`Dispensed · ${rec.dispenseNo}`); onDone(); onClose();
    } catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} size="xl" title="Dispense Medicines"
      footer={<>
        <span className="mr-auto text-sm text-muted">Total: ₹{total.toFixed(2)}</span>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" form="disp-f" loading={saving}>Dispense</Button>
      </>}>
      <form id="disp-f" onSubmit={submit} className="space-y-4" noValidate>
        <PatientPicker value={patient} onChange={setPatient} />
        <div className="space-y-2">
          <label className="label">Medicines {error && <span className="text-red-500">· {error}</span>}</label>
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2">
              <Select className="flex-1" placeholder="Select medicine" options={options} value={r.medicine} onChange={(e) => setRow(i, 'medicine', e.target.value)} />
              <Input className="w-24" type="number" min="1" value={r.quantity} onChange={(e) => setRow(i, 'quantity', e.target.value)} />
              <button type="button" onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))} className="btn-ghost h-10 w-10 !p-0 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button type="button" variant="outline" className="h-8" onClick={() => setRows((p) => [...p, { medicine: '', quantity: 1 }])}><Plus className="h-4 w-4" /> Add Medicine</Button>
        </div>
        <p className="text-xs text-muted">Stock is drawn first-expiry-first-out and reduced automatically.</p>
      </form>
    </Modal>
  );
}
