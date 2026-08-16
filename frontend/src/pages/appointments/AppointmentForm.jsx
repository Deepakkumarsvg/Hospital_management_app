import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
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

// Weekday letters used by Doctor.availability, indexed by JS Date#getDay() (0=Sun).
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
function weekdayOf(dateStr) {
  if (!dateStr) return null;
  return DOW[new Date(`${dateStr}T00:00:00`).getDay()];
}

// presetDoctor/presetDepartment/presetDate let callers (e.g. "suggest a
// follow-up" from OPD) pre-fill the form instead of starting blank.
export default function AppointmentForm({ open, onClose, onSaved, presetPatient, presetDoctor, presetDepartment, presetDate }) {
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
    setDepartment(presetDepartment || ''); setDoctor(presetDoctor || ''); setType('NEW'); setReason('');
    setDate(presetDate || toDateInput(new Date().toISOString())); setTime('10:00'); setErrors({});
  }, [open, presetPatient, presetDoctor, presetDepartment, presetDate]);

  // Load doctors when department changes — keep the current doctor selected
  // if it's still valid for the new list (so a preset survives this reload).
  useEffect(() => {
    if (!department) { setDoctors([]); setDoctor(''); return; }
    activeDoctors(department).then((list) => {
      setDoctors(list);
      setDoctor((prev) => (prev && list.some((d) => (d.id || d._id) === prev) ? prev : ''));
    }).catch(() => setDoctors([]));
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

  // Non-blocking heads-up if the chosen date falls outside the doctor's weekly availability.
  const selectedDoctor = doctors.find((d) => (d.id || d._id) === doctor);
  const offDay = selectedDoctor && date
    && !(selectedDoctor.availability || []).some((a) => a.day === weekdayOf(date));

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
        {offDay && (
          <p className="sm:col-span-2 -mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {selectedDoctor.fullName} isn't scheduled on {weekdayOf(date)}s per their weekly availability. You can still book — just double-check with them.
          </p>
        )}
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
