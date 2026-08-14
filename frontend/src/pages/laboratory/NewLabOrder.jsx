import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import Modal from '../../components/ui/Modal.jsx';
import Button from '../../components/ui/Button.jsx';
import PatientPicker from '../appointments/PatientPicker.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { activeLabTests, createLabOrder } from '../../services/labService.js';

export default function NewLabOrder({ open, onClose, onCreated, presetPatient }) {
  const toast = useToast();
  const [tests, setTests] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [query, setQuery] = useState('');
  const [patient, setPatient] = useState(null);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    activeLabTests().then(setTests).catch(() => setTests([]));
    setPatient(presetPatient || null);
    setSelected(new Set()); setQuery(''); setNotes(''); setErrors({});
  }, [open, presetPatient]);

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (!patient) er.patient = 'Select a patient';
    if (selected.size === 0) er.tests = 'Select at least one test';
    setErrors(er);
    if (Object.keys(er).length) return;

    setSaving(true);
    try {
      const order = await createLabOrder({ patient: patient.id || patient._id, tests: [...selected], notes });
      toast.success(`Order created · ${order.orderNo}`);
      onCreated(order);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Could not create order');
    } finally {
      setSaving(false);
    }
  };

  const filtered = tests.filter((t) => (t.name + t.code + t.category).toLowerCase().includes(query.toLowerCase()));
  const total = tests.filter((t) => selected.has(t.id || t._id)).reduce((s, t) => s + (t.price || 0), 0);

  return (
    <Modal open={open} onClose={onClose} size="xl" title="New Lab Order"
      footer={<>
        <span className="mr-auto text-sm text-muted">Selected: {selected.size} · ₹{total}</span>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" form="lab-order-f" loading={saving}>Create Order</Button>
      </>}>
      <form id="lab-order-f" onSubmit={submit} className="space-y-4" noValidate>
        <PatientPicker value={patient} onChange={setPatient} error={errors.patient} />

        <div>
          <label className="label">Tests {errors.tests && <span className="text-red-500">· {errors.tests}</span>}</label>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input pl-9" placeholder="Search tests…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
            {filtered.length === 0 ? (
              <p className="px-2 py-4 text-center text-sm text-muted">No tests. Add tests in the Test Master first.</p>
            ) : filtered.map((t) => {
              const id = t.id || t._id;
              const on = selected.has(id);
              return (
                <label key={id} className={'flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm ' + (on ? 'bg-accent/10' : 'hover:bg-surface')}>
                  <span className="flex items-center gap-2">
                    <input type="checkbox" checked={on} onChange={() => toggle(id)} className="h-4 w-4" />
                    <span className="font-medium">{t.name}</span>
                    <span className="text-xs text-muted">{t.code} · {t.category}</span>
                  </span>
                  <span className="tabular-nums text-muted">₹{t.price}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea rows={2} className="input resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Clinical notes for the lab…" />
        </div>
      </form>
    </Modal>
  );
}
