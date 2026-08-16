import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import Select from '../../components/ui/Select.jsx';
import Button from '../../components/ui/Button.jsx';
import PatientPicker from '../appointments/PatientPicker.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { createVisit } from '../../services/opdService.js';
import { activeDepartments } from '../../services/departmentService.js';
import { activeDoctors } from '../../services/doctorService.js';

// Start a new OPD visit (walk-in, from a patient, or from a checked-in
// appointment — presetAppointment links the visit back so completing it
// also completes the appointment). onCreated(visit) fires after save.
export default function OpdStartForm({ open, onClose, onCreated, presetPatient, presetDoctor, presetDepartment, presetAppointment }) {
  const toast = useToast();
  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [patient, setPatient] = useState(null);
  const [department, setDepartment] = useState('');
  const [doctor, setDoctor] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    activeDepartments().then(setDepartments).catch(() => {});
    setPatient(presetPatient || null);
    setDepartment(presetDepartment || ''); setDoctor(presetDoctor || ''); setErrors({});
  }, [open, presetPatient, presetDoctor, presetDepartment]);

  // Keep the current doctor selected if it's still valid for the reloaded list
  // (so a preset survives this reload instead of being cleared).
  useEffect(() => {
    if (!department) { setDoctors([]); setDoctor(''); return; }
    activeDoctors(department).then((l) => {
      setDoctors(l);
      setDoctor((prev) => (prev && l.some((d) => (d.id || d._id) === prev) ? prev : ''));
    }).catch(() => setDoctors([]));
  }, [department]);

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (!patient) er.patient = 'Select a patient';
    if (!department) er.department = 'Select a department';
    if (!doctor) er.doctor = 'Select a doctor';
    setErrors(er);
    if (Object.keys(er).length) return;

    setSaving(true);
    try {
      const visit = await createVisit({
        patient: patient.id || patient._id, department, doctor,
        appointment: presetAppointment || undefined,
      });
      toast.success(`Visit started · ${visit.visitNo}`);
      onCreated(visit);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Could not start visit');
    } finally {
      setSaving(false);
    }
  };

  const deptOptions = departments.map((d) => ({ value: d.id || d._id, label: `${d.name} (${d.code})` }));
  const docOptions = doctors.map((d) => ({ value: d.id || d._id, label: `${d.fullName} · ${d.specialization}` }));

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Start OPD Visit"
      footer={<>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" form="opd-start" loading={saving}>Start Consultation</Button>
      </>}>
      <form id="opd-start" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><PatientPicker value={patient} onChange={setPatient} error={errors.patient} /></div>
        <Select label="Department *" placeholder="Select department" options={deptOptions}
          value={department} onChange={(e) => setDepartment(e.target.value)} error={errors.department} />
        <Select label="Doctor *" placeholder={department ? 'Select doctor' : 'Select department first'}
          options={docOptions} value={doctor} onChange={(e) => setDoctor(e.target.value)} disabled={!department} error={errors.doctor} />
      </form>
    </Modal>
  );
}
