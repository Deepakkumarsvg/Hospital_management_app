import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from '../../components/ui/Modal.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Button from '../../components/ui/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { updateAppointment } from '../../services/appointmentService.js';
import { getDoctor } from '../../services/doctorService.js';
import { toDateInput, APPOINTMENT_TYPE_OPTIONS } from '../../utils/constants.js';

// Weekday letters used by Doctor.availability, indexed by JS Date#getDay() (0=Sun).
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
function weekdayOf(dateStr) {
  if (!dateStr) return null;
  return DOW[new Date(`${dateStr}T00:00:00`).getDay()];
}

// Edit date / time / type / reason of an existing appointment (reschedule).
export default function RescheduleModal({ open, onClose, appointment, onSaved }) {
  const toast = useToast();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [type, setType] = useState('NEW');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [doctorAvailability, setDoctorAvailability] = useState(null);

  useEffect(() => {
    if (!open || !appointment) return;
    setDate(toDateInput(appointment.date));
    setTime(appointment.time || '');
    setType(appointment.type || 'NEW');
    setReason(appointment.reason || '');
    const doctorId = appointment.doctor?.id || appointment.doctor?._id;
    if (doctorId) {
      getDoctor(doctorId).then((d) => setDoctorAvailability(d.availability || [])).catch(() => setDoctorAvailability(null));
    }
  }, [open, appointment]);

  const offDay = doctorAvailability && date && !doctorAvailability.some((a) => a.day === weekdayOf(date));

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateAppointment(appointment.id || appointment._id, { date, time, type, reason });
      toast.success('Appointment updated');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Could not update appointment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open} onClose={onClose} size="md"
      title="Reschedule / Edit Appointment"
      description={appointment?.appointmentNo}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="reschedule-form" loading={saving}>Save</Button>
        </>
      }
    >
      <form id="reschedule-form" onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Input type="date" label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input type="time" label="Time" value={time} onChange={(e) => setTime(e.target.value)} />
        {offDay && (
          <p className="sm:col-span-2 -mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Doctor isn't scheduled on {weekdayOf(date)}s per their weekly availability.
          </p>
        )}
        <Select label="Type" options={APPOINTMENT_TYPE_OPTIONS} value={type} onChange={(e) => setType(e.target.value)} />
        <div className="sm:col-span-2">
          <label className="label">Reason / Notes</label>
          <textarea rows={2} className="input resize-y" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}
