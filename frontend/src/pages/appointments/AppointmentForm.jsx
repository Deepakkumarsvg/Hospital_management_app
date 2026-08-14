import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Button from '../../components/ui/Button.jsx';
import PatientPicker from './PatientPicker.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { createAppointment } from '../../services/appointmentService.js';
import { activeDepartments } from '../../services/departmentService.js';
import { activeDoctors } from '../../services/doctorService.js';
import { toDateInput, APPOINTMENT_TYPE_OPTIONS } from '../../utils/constants.js';

export default function AppointmentForm({ open, onClose, onSaved, presetPatient }) {
  const toast = useToast();
  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);

  const [patient, setPatient] = useState(null);
  const [department, setDepartment] = useState('');
  const [doctor, setDoctor] = useState('');
  const [date, setDate] = useState(toDateInput(new Date().toISOString()));
  const [time, setTime] = useState('10:00');
  const [type, setType] = useState('NEW');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    activeDepartments().then(setDepartments).catch(() => {});
    setPatient(presetPatient || null);
    setDepartment(''); setDoctor(''); setType('NEW'); setReason('');
    setDate(toDateInput(new Date().toISOString())); setTime('10:00'); setErrors({});
  }, [open, presetPatient]);

  // Load doctors when department changes.
  useEffect(() => {
    if (!department) { setDoctors([]); setDoctor(''); return; }
    activeDoctors(department).then((list) => { setDoctors(list); setDoctor(''); }).catch(() => setDoctors([]));
  }, [department]);

  const validate = () => {
    const e = {};
    if (!patient) e.patient = 'Select a patient';
    if (!department) e.department = 'Select a department';
    if (!doctor) e.doctor = 'Select a doctor';
    if (!date) e.date = 'Select a date';
    if (!time) e.time = 'Select a time';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const saved = await createAppointment({
        patient: patient.id || patient._id,
        doctor, department, date, time, type, reason,
      });
      toast.success(`Appointment booked · ${saved.appointmentNo}`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Could not book appointment');
    } finally {
      setSaving(false);
    }
  };

  const deptOptions = departments.map((d) => ({ value: d.id || d._id, label: `${d.name} (${d.code})` }));
  const docOptions = doctors.map((d) => ({ value: d.id || d._id, label: `${d.fullName} · ${d.specialization}` }));

  return (
    <Modal
      open={open} onClose={onClose} size="xl" title="Book Appointment"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="appt-form" loading={saving}>Book Appointment</Button>
        </>
      }
    >
      <form id="appt-form" onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <PatientPicker value={patient} onChange={setPatient} error={errors.patient} />
        </div>
        <Select label="Department *" placeholder="Select department" options={deptOptions}
          value={department} onChange={(e) => setDepartment(e.target.value)} error={errors.department} />
        <Select label="Doctor *" placeholder={department ? 'Select doctor' : 'Select department first'}
          options={docOptions} value={doctor} onChange={(e) => setDoctor(e.target.value)}
          disabled={!department} error={errors.doctor} />
        <Input type="date" label="Date *" value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
        <Input type="time" label="Time *" value={time} onChange={(e) => setTime(e.target.value)} error={errors.time} />
        <Select label="Type" options={APPOINTMENT_TYPE_OPTIONS} value={type} onChange={(e) => setType(e.target.value)} />
        <div className="sm:col-span-2">
          <label className="label">Reason / Notes</label>
          <textarea rows={2} className="input resize-y" placeholder="Chief complaint…"
            value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}
