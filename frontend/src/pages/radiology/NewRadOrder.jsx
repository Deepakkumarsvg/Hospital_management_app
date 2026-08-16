import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import Modal from '../../components/ui/Modal.jsx';
import Select from '../../components/ui/Select.jsx';
import Input from '../../components/ui/Input.jsx';
import Button from '../../components/ui/Button.jsx';
import PatientPicker from '../appointments/PatientPicker.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { activeRadTests, createRadOrder } from '../../services/radiologyService.js';
import { activeDoctors } from '../../services/doctorService.js';
import { MODALITY_OPTIONS } from '../../utils/constants.js';

// presetDoctor/presetOpdVisit let callers (e.g. "Order Radiology" from an OPD
// consultation) pre-fill and link the order back to that visit.
export default function NewRadOrder({ open, onClose, onCreated, presetPatient, presetDoctor, presetOpdVisit }) {
  const toast = useToast();
  const [tests, setTests] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [patient, setPatient] = useState(null);
  const [doctor, setDoctor] = useState('');
  const [test, setTest] = useState('');
  const [showAdhoc, setShowAdhoc] = useState(false);
  const [adhocName, setAdhocName] = useState('');
  const [adhocModality, setAdhocModality] = useState('XRAY');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    activeRadTests().then(setTests).catch(() => setTests([]));
    activeDoctors().then(setDoctors).catch(() => setDoctors([]));
    setPatient(presetPatient || null); setDoctor(presetDoctor || ''); setTest(''); setNotes('');
    setShowAdhoc(false); setAdhocName(''); setAdhocModality('XRAY'); setErrors({});
  }, [open, presetPatient, presetDoctor]);

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (!patient) er.patient = 'Select a patient';
    if (!test && !(showAdhoc && adhocName.trim())) er.test = 'Select a test or enter a name';
    setErrors(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    try {
      const payload = {
        patient: patient.id || patient._id,
        doctor: doctor || undefined,
        opdVisit: presetOpdVisit || undefined,
        notes,
      };
      if (showAdhoc && adhocName.trim()) { payload.testName = adhocName.trim(); payload.modality = adhocModality; }
      else payload.test = test;
      const order = await createRadOrder(payload);
      toast.success(`Order created · ${order.orderNo}`);
      onCreated(order); onClose();
    } catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };

  const options = tests.map((t) => ({ value: t.id || t._id, label: `${t.name} · ${t.modality} · ₹${t.price}` }));
  const doctorOptions = [{ value: '', label: 'None' }, ...doctors.map((d) => ({ value: d.id || d._id, label: `${d.fullName} · ${d.specialization}` }))];
  return (
    <Modal open={open} onClose={onClose} size="lg" title="New Radiology Order"
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" form="rad-order-f" loading={saving}>Create Order</Button></>}>
      <form id="rad-order-f" onSubmit={submit} className="space-y-4" noValidate>
        <PatientPicker value={patient} onChange={setPatient} error={errors.patient} />
        <Select label="Ordering Doctor" options={doctorOptions} value={doctor} onChange={(e) => setDoctor(e.target.value)} />

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="label !mb-0">Investigation {errors.test && <span className="text-red-500">· {errors.test}</span>}</label>
            {!showAdhoc && (
              <button type="button" onClick={() => { setShowAdhoc(true); setTest(''); }} className="inline-flex items-center gap-1 text-xs font-medium text-fg hover:underline">
                <Plus className="h-3.5 w-3.5" /> Not in catalogue
              </button>
            )}
          </div>
          {showAdhoc ? (
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-dashed border-border p-3">
              <Input label="Name *" value={adhocName} onChange={(e) => setAdhocName(e.target.value)} placeholder="e.g. Barium swallow" />
              <Select label="Modality" options={MODALITY_OPTIONS} value={adhocModality} onChange={(e) => setAdhocModality(e.target.value)} />
              <button type="button" onClick={() => { setShowAdhoc(false); setAdhocName(''); }} className="col-span-2 text-left text-xs text-muted hover:text-fg hover:underline">
                Use catalogue instead
              </button>
            </div>
          ) : (
            <Select placeholder={options.length ? 'Select investigation' : 'Add tests in Test Master first'} options={options} value={test} onChange={(e) => setTest(e.target.value)} />
          )}
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea rows={2} className="input resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Clinical indication…" />
        </div>
      </form>
    </Modal>
  );
}
