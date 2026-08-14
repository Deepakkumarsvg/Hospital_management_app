import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Button from '../../components/ui/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { updateAppointment } from '../../services/appointmentService.js';
import { toDateInput, APPOINTMENT_TYPE_OPTIONS } from '../../utils/constants.js';

// Edit date / time / type / reason of an existing appointment (reschedule).
export default function RescheduleModal({ open, onClose, appointment, onSaved }) {
  const toast = useToast();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [type, setType] = useState('NEW');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !appointment) return;
    setDate(toDateInput(appointment.date));
    setTime(appointment.time || '');
    setType(appointment.type || 'NEW');
    setReason(appointment.reason || '');
  }, [open, appointment]);

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
        <Select label="Type" options={APPOINTMENT_TYPE_OPTIONS} value={type} onChange={(e) => setType(e.target.value)} />
        <div className="sm:col-span-2">
          <label className="label">Reason / Notes</label>
          <textarea rows={2} className="input resize-y" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}
