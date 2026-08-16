import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import Select from '../../components/ui/Select.jsx';
import Input from '../../components/ui/Input.jsx';
import Button from '../../components/ui/Button.jsx';
import PatientPicker from '../appointments/PatientPicker.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { admitPatient } from '../../services/ipdService.js';
import { activeDepartments } from '../../services/departmentService.js';
import { activeDoctors } from '../../services/doctorService.js';
import { listWards, availableBeds } from '../../services/facilityService.js';

// presetDoctor/presetDepartment/presetDiagnosis let callers (e.g. "Admit to
// IPD" from an OPD consultation) pre-fill the form instead of starting blank.
export default function AdmitForm({ open, onClose, onSaved, presetPatient, presetDoctor, presetDepartment, presetDiagnosis }) {
  const toast = useToast();
  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [wards, setWards] = useState([]);
  const [beds, setBeds] = useState([]);

  const [patient, setPatient] = useState(null);
  const [department, setDepartment] = useState('');
  const [doctor, setDoctor] = useState('');
  const [ward, setWard] = useState('');
  const [bed, setBed] = useState('');
  const [reason, setReason] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    activeDepartments().then(setDepartments).catch(() => {});
    listWards().then((w) => setWards(w.filter((x) => x.status === 'ACTIVE'))).catch(() => {});
    setPatient(presetPatient || null);
    setDepartment(presetDepartment || ''); setDoctor(presetDoctor || ''); setWard(''); setBed('');
    setReason(''); setDiagnosis(presetDiagnosis || ''); setErrors({});
  }, [open, presetPatient, presetDoctor, presetDepartment, presetDiagnosis]);

  // Keep the current doctor selected if it's still valid for the reloaded
  // list (so a preset survives this reload instead of being cleared).
  useEffect(() => {
    if (!department) { setDoctors([]); setDoctor(''); return; }
    activeDoctors(department).then((l) => {
      setDoctors(l);
      setDoctor((prev) => (prev && l.some((d) => (d.id || d._id) === prev) ? prev : ''));
    }).catch(() => setDoctors([]));
  }, [department]);

  useEffect(() => {
    availableBeds(ward || undefined).then(setBeds).catch(() => setBeds([]));
    setBed('');
  }, [ward]);

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (!patient) er.patient = 'Select a patient';
    if (!department) er.department = 'Select a department';
    if (!doctor) er.doctor = 'Select a doctor';
    if (!bed) er.bed = 'Select a bed';
    setErrors(er);
    if (Object.keys(er).length) return;

    setSaving(true);
    try {
      const adm = await admitPatient({ patient: patient.id || patient._id, admittingDoctor: doctor, department, bed, reason, diagnosis });
      toast.success(`Admitted · ${adm.admissionNo}`);
      onSaved(adm);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Could not admit patient');
    } finally {
      setSaving(false);
    }
  };

  const deptOptions = departments.map((d) => ({ value: d.id || d._id, label: `${d.name} (${d.code})` }));
  const docOptions = doctors.map((d) => ({ value: d.id || d._id, label: `${d.fullName} · ${d.specialization}` }));
  const wardOptions = [{ value: '', label: 'Any ward' }, ...wards.map((w) => ({ value: w.id || w._id, label: `${w.name} (${w.code})` }))];
  const bedOptions = beds.map((b) => ({ value: b.id || b._id, label: `${b.ward?.name} · Room ${b.room?.roomNo} · Bed ${b.bedNo} · ₹${b.dailyCharge}/day` }));

  return (
    <Modal open={open} onClose={onClose} size="xl" title="Admit Patient (IPD)"
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" form="admit-f" loading={saving}>Admit</Button></>}>
      <form id="admit-f" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><PatientPicker value={patient} onChange={setPatient} error={errors.patient} /></div>
        <Select label="Department *" placeholder="Select department" options={deptOptions} value={department} onChange={(e) => setDepartment(e.target.value)} error={errors.department} />
        <Select label="Admitting Doctor *" placeholder={department ? 'Select doctor' : 'Select department first'} options={docOptions} value={doctor} onChange={(e) => setDoctor(e.target.value)} disabled={!department} error={errors.doctor} />
        <Select label="Ward (filter)" options={wardOptions} value={ward} onChange={(e) => setWard(e.target.value)} />
        <Select label="Bed *" placeholder={bedOptions.length ? 'Select an available bed' : 'No available beds'} options={bedOptions} value={bed} onChange={(e) => setBed(e.target.value)} error={errors.bed} />
        <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} className="sm:col-span-2" />
        <div className="sm:col-span-2">
          <label className="label">Provisional Diagnosis</label>
          <textarea rows={2} className="input resize-y" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}
