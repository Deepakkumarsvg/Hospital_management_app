import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import Select from '../../components/ui/Select.jsx';
import Button from '../../components/ui/Button.jsx';
import PatientPicker from '../appointments/PatientPicker.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { activeRadTests, createRadOrder } from '../../services/radiologyService.js';

export default function NewRadOrder({ open, onClose, onCreated, presetPatient }) {
  const toast = useToast();
  const [tests, setTests] = useState([]);
  const [patient, setPatient] = useState(null);
  const [test, setTest] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    activeRadTests().then(setTests).catch(() => setTests([]));
    setPatient(presetPatient || null); setTest(''); setNotes(''); setErrors({});
  }, [open, presetPatient]);

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (!patient) er.patient = 'Select a patient';
    if (!test) er.test = 'Select a test';
    setErrors(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    try {
      const order = await createRadOrder({ patient: patient.id || patient._id, test, notes });
      toast.success(`Order created · ${order.orderNo}`);
      onCreated(order); onClose();
    } catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };

  const options = tests.map((t) => ({ value: t.id || t._id, label: `${t.name} · ${t.modality} · ₹${t.price}` }));
  return (
    <Modal open={open} onClose={onClose} size="lg" title="New Radiology Order"
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" form="rad-order-f" loading={saving}>Create Order</Button></>}>
      <form id="rad-order-f" onSubmit={submit} className="space-y-4" noValidate>
        <PatientPicker value={patient} onChange={setPatient} error={errors.patient} />
        <Select label="Test *" placeholder={options.length ? 'Select investigation' : 'Add tests in Test Master first'} options={options} value={test} onChange={(e) => setTest(e.target.value)} error={errors.test} />
        <div>
          <label className="label">Notes</label>
          <textarea rows={2} className="input resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Clinical indication…" />
        </div>
      </form>
    </Modal>
  );
}
