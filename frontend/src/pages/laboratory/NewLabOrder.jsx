import { useEffect, useState } from 'react';
import { Search, Plus, X } from 'lucide-react';
import Modal from '../../components/ui/Modal.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import PatientPicker from '../appointments/PatientPicker.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { activeLabTests, createLabOrder } from '../../services/labService.js';
import { activeDoctors } from '../../services/doctorService.js';

const EMPTY_ADHOC = { name: '', unit: '', referenceRange: '', price: '' };

// presetDoctor/presetOpdVisit let callers (e.g. "Order Lab Test" from an OPD
// consultation) pre-fill and link the order back to that visit.
export default function NewLabOrder({ open, onClose, onCreated, presetPatient, presetDoctor, presetOpdVisit }) {
  const toast = useToast();
  const [tests, setTests] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [adhocItems, setAdhocItems] = useState([]);
  const [adhoc, setAdhoc] = useState(EMPTY_ADHOC);
  const [showAdhoc, setShowAdhoc] = useState(false);
  const [query, setQuery] = useState('');
  const [patient, setPatient] = useState(null);
  const [doctor, setDoctor] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    activeLabTests().then(setTests).catch(() => setTests([]));
    activeDoctors().then(setDoctors).catch(() => setDoctors([]));
    setPatient(presetPatient || null);
    setDoctor(presetDoctor || '');
    setSelected(new Set()); setAdhocItems([]); setAdhoc(EMPTY_ADHOC); setShowAdhoc(false);
    setQuery(''); setNotes(''); setErrors({});
  }, [open, presetPatient, presetDoctor]);

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const addAdhoc = () => {
    if (!adhoc.name.trim()) { toast.error('Enter a test name'); return; }
    setAdhocItems((prev) => [...prev, { ...adhoc, name: adhoc.name.trim(), price: Number(adhoc.price) || 0 }]);
    setAdhoc(EMPTY_ADHOC);
    setShowAdhoc(false);
  };
  const removeAdhoc = (i) => setAdhocItems((prev) => prev.filter((_, idx) => idx !== i));

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (!patient) er.patient = 'Select a patient';
    if (selected.size === 0 && adhocItems.length === 0) er.tests = 'Select or add at least one test';
    setErrors(er);
    if (Object.keys(er).length) return;

    setSaving(true);
    try {
      const order = await createLabOrder({
        patient: patient.id || patient._id,
        doctor: doctor || undefined,
        opdVisit: presetOpdVisit || undefined,
        tests: [...selected],
        items: adhocItems,
        notes,
      });
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
  const total = tests.filter((t) => selected.has(t.id || t._id)).reduce((s, t) => s + (t.price || 0), 0)
    + adhocItems.reduce((s, it) => s + (it.price || 0), 0);
  const doctorOptions = [{ value: '', label: 'None' }, ...doctors.map((d) => ({ value: d.id || d._id, label: `${d.fullName} · ${d.specialization}` }))];

  return (
    <Modal open={open} onClose={onClose} size="xl" title="New Lab Order"
      footer={<>
        <span className="mr-auto text-sm text-muted">Selected: {selected.size + adhocItems.length} · ₹{total}</span>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" form="lab-order-f" loading={saving}>Create Order</Button>
      </>}>
      <form id="lab-order-f" onSubmit={submit} className="space-y-4" noValidate>
        <PatientPicker value={patient} onChange={setPatient} error={errors.patient} />
        <Select label="Ordering Doctor" options={doctorOptions} value={doctor} onChange={(e) => setDoctor(e.target.value)} />

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

        {/* Ad-hoc (non-catalogue) tests */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="label !mb-0">Custom Tests (not in catalogue)</label>
            {!showAdhoc && (
              <button type="button" onClick={() => setShowAdhoc(true)} className="inline-flex items-center gap-1 text-xs font-medium text-fg hover:underline">
                <Plus className="h-3.5 w-3.5" /> Add custom test
              </button>
            )}
          </div>
          {adhocItems.length > 0 && (
            <div className="mb-2 space-y-1">
              {adhocItems.map((it, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{it.name}</span>
                    <span className="text-xs text-muted"> {it.unit ? `· ${it.unit}` : ''} {it.referenceRange ? `· ref ${it.referenceRange}` : ''}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums text-muted">₹{it.price || 0}</span>
                    <button type="button" onClick={() => removeAdhoc(i)} className="text-muted hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                  </span>
                </div>
              ))}
            </div>
          )}
          {showAdhoc && (
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-dashed border-border p-3 sm:grid-cols-4">
              <Input placeholder="Test name *" value={adhoc.name} onChange={(e) => setAdhoc({ ...adhoc, name: e.target.value })} />
              <Input placeholder="Unit" value={adhoc.unit} onChange={(e) => setAdhoc({ ...adhoc, unit: e.target.value })} />
              <Input placeholder="Reference range" value={adhoc.referenceRange} onChange={(e) => setAdhoc({ ...adhoc, referenceRange: e.target.value })} />
              <div className="flex gap-2">
                <Input type="number" placeholder="Price ₹" value={adhoc.price} onChange={(e) => setAdhoc({ ...adhoc, price: e.target.value })} />
                <Button type="button" variant="outline" className="!px-3" onClick={addAdhoc}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea rows={2} className="input resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Clinical notes for the lab…" />
        </div>
      </form>
    </Modal>
  );
}
