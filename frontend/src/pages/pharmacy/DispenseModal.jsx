import { useEffect, useState } from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import Modal from '../../components/ui/Modal.jsx';
import Select from '../../components/ui/Select.jsx';
import Input from '../../components/ui/Input.jsx';
import Button from '../../components/ui/Button.jsx';
import PatientPicker from '../appointments/PatientPicker.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { activeMedicines, dispenseMedicines } from '../../services/pharmacyService.js';
import { activeDoctors } from '../../services/doctorService.js';

// presetDoctor/presetOpdVisit let callers (e.g. "Dispense Medicine" from an
// OPD consultation) pre-fill and link the record back to that visit.
// presetPrescription (visit.prescription — free-text medicine names) is
// best-effort matched against the catalogue so the pharmacist doesn't have
// to retype what the doctor already wrote on the Rx.
export default function DispenseModal({ open, onClose, onDone, presetPatient, presetDoctor, presetOpdVisit, presetPrescription }) {
  const toast = useToast();
  const [meds, setMeds] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [patient, setPatient] = useState(null);
  const [doctor, setDoctor] = useState('');
  const [rows, setRows] = useState([{ medicine: '', quantity: 1 }]);
  const [unmatched, setUnmatched] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    activeDoctors().then(setDoctors).catch(() => setDoctors([]));
    setPatient(presetPatient || null); setDoctor(presetDoctor || ''); setError(''); setUnmatched([]);
    activeMedicines().then((list) => {
      setMeds(list);
      if (presetPrescription?.length) {
        const matched = [];
        const missed = [];
        for (const rx of presetPrescription) {
          const m = list.find((x) => x.name.toLowerCase() === (rx.medicine || '').toLowerCase());
          if (m) matched.push({ medicine: m.id || m._id, quantity: rx.quantity > 0 ? rx.quantity : 1 });
          else missed.push(rx.medicine);
        }
        setRows(matched.length ? matched : [{ medicine: '', quantity: 1 }]);
        setUnmatched(missed);
      } else {
        setRows([{ medicine: '', quantity: 1 }]);
      }
    }).catch(() => setMeds([]));
  }, [open, presetPatient, presetDoctor, presetPrescription]);

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
      const rec = await dispenseMedicines({
        patient: patient ? (patient.id || patient._id) : null,
        doctor: doctor || undefined,
        opdVisit: presetOpdVisit || undefined,
        items,
      });
      toast.success(`Dispensed · ${rec.dispenseNo}`); onDone(); onClose();
    } catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };
  const doctorOptions = [{ value: '', label: 'None' }, ...doctors.map((d) => ({ value: d.id || d._id, label: `${d.fullName} · ${d.specialization}` }))];

  return (
    <Modal open={open} onClose={onClose} size="xl" title="Dispense Medicines"
      footer={<>
        <span className="mr-auto text-sm text-muted">Total: ₹{total.toFixed(2)}</span>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" form="disp-f" loading={saving}>Dispense</Button>
      </>}>
      <form id="disp-f" onSubmit={submit} className="space-y-4" noValidate>
        <PatientPicker value={patient} onChange={setPatient} />
        <Select label="Prescribed by (Doctor)" options={doctorOptions} value={doctor} onChange={(e) => setDoctor(e.target.value)} />
        {unmatched.length > 0 && (
          <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Not in catalogue, add manually: {unmatched.join(', ')}
          </p>
        )}
        <div className="space-y-2">
          <label className="label">Medicines {error && <span className="text-red-500">· {error}</span>}</label>
          {rows.map((r, i) => {
            const stock = medById[r.medicine]?.currentStock;
            const over = stock != null && Number(r.quantity) > stock;
            return (
              <div key={i}>
                <div className="flex gap-2">
                  <Select className="flex-1" placeholder="Select medicine" options={options} value={r.medicine} onChange={(e) => setRow(i, 'medicine', e.target.value)} />
                  <Input className={'w-24' + (over ? ' ring-2 ring-red-500/60' : '')} type="number" min="1" value={r.quantity} onChange={(e) => setRow(i, 'quantity', e.target.value)} />
                  <button type="button" onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))} className="btn-ghost h-10 w-10 !p-0 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                </div>
                {over && <p className="mt-1 text-xs text-red-500">Only {stock} in stock</p>}
              </div>
            );
          })}
          <Button type="button" variant="outline" className="h-8" onClick={() => setRows((p) => [...p, { medicine: '', quantity: 1 }])}><Plus className="h-4 w-4" /> Add Medicine</Button>
        </div>
        <p className="text-xs text-muted">Stock is drawn first-expiry-first-out (excluding expired batches) and reduced automatically.</p>
      </form>
    </Modal>
  );
}
