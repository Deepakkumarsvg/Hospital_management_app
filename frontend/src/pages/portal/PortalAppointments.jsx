import { useEffect, useState, useCallback } from 'react';
import { Plus, CalendarDays, X, Video, CalendarClock } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  getPortalAppointments, getPortalDoctors, bookAppointment, cancelAppointment,
  rescheduleAppointment, meetingUrl,
} from '../../services/portalService.js';
import { APPOINTMENT_STATUS_META, money, formatDate } from '../../utils/constants.js';

function BookModal({ doctors, onClose, onDone }) {
  const toast = useToast();
  const [doctor, setDoctor] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [teleconsult, setTeleconsult] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = doctors.find((d) => d.id === doctor);
  const doctorOptions = [
    { value: '', label: 'Select a doctor…' },
    ...doctors.map((d) => ({ value: d.id, label: `Dr. ${d.firstName} ${d.lastName} — ${d.specialization}` })),
  ];

  const submit = async (e) => {
    e.preventDefault();
    if (!doctor) return toast.error('Please choose a doctor');
    setSaving(true);
    try {
      await bookAppointment({ doctor, date, time, reason, teleconsult });
      toast.success('Appointment booked');
      onDone(); onClose();
    } catch (err) {
      toast.error(err.message || 'Booking failed');
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} size="md" title="Book an appointment"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="book-f" loading={saving}>Book</Button></>}>
      <form id="book-f" onSubmit={submit} className="space-y-4">
        <Select label="Doctor" options={doctorOptions} value={doctor} onChange={(e) => setDoctor(e.target.value)} required />
        {selected && (
          <p className="rounded-lg border border-border bg-elevated px-3 py-2 text-xs text-muted">
            {selected.department?.name} · Consultation fee {money(selected.consultationFee)}
          </p>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Input type="date" label="Date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <Input type="time" label="Time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </div>
        <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Fever, follow-up" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={teleconsult} onChange={(e) => setTeleconsult(e.target.checked)} className="h-4 w-4" />
          <Video className="h-4 w-4 text-muted" /> Video consultation (online)
        </label>
      </form>
    </Modal>
  );
}

function RescheduleModal({ appt, onClose, onDone }) {
  const toast = useToast();
  const [date, setDate] = useState('');
  const [time, setTime] = useState(appt.time || '');
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try { await rescheduleAppointment(appt.id, { date, time }); toast.success('Rescheduled'); onDone(); onClose(); }
    catch (err) { toast.error(err.message || 'Reschedule failed'); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} size="sm" title="Reschedule appointment"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="resched-f" loading={saving}>Save</Button></>}>
      <form id="resched-f" onSubmit={submit} className="grid grid-cols-2 gap-4">
        <Input type="date" label="New date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <Input type="time" label="New time" value={time} onChange={(e) => setTime(e.target.value)} required />
      </form>
    </Modal>
  );
}

export default function PortalAppointments() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bookOpen, setBookOpen] = useState(false);
  const [cancelId, setCancelId] = useState(null);
  const [reschedule, setReschedule] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await getPortalAppointments()); }
    catch (e) { toast.error(e.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); getPortalDoctors().then(setDoctors).catch(() => {}); }, [load]);

  const doCancel = async () => {
    try { await cancelAppointment(cancelId); toast.success('Appointment cancelled'); setCancelId(null); load(); }
    catch (e) { toast.error(e.message || 'Cancel failed'); }
  };

  return (
    <div className="space-y-5">
      <div className="card flex items-center justify-between p-5">
        <div>
          <h1 className="text-xl font-semibold">Appointments</h1>
          <p className="mt-0.5 text-sm text-muted">Book a new appointment or manage existing ones.</p>
        </div>
        <Button onClick={() => setBookOpen(true)}><Plus className="h-4 w-4" /> Book</Button>
      </div>

      {loading ? <Spinner full /> : items.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No appointments yet" description="Book your first appointment to get started." />
      ) : (
        <div className="space-y-3">
          {items.map((a) => {
            const meta = APPOINTMENT_STATUS_META[a.status] || {};
            const canCancel = ['BOOKED', 'CHECKED_IN'].includes(a.status);
            return (
              <Card key={a.id} className="!p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">Dr. {a.doctor?.firstName} {a.doctor?.lastName}</p>
                      <Badge tone={meta.tone}>{meta.label || a.status}</Badge>
                      <span className="font-mono text-xs text-muted">{a.appointmentNo}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {a.doctor?.specialization} · {a.department?.name} · {formatDate(a.date)} at {a.time}
                      {a.teleconsult && <span className="ml-1 inline-flex items-center gap-1 text-fg"><Video className="h-3.5 w-3.5" /> Video</span>}
                    </p>
                    {a.reason && <p className="mt-1 text-xs text-muted">Reason: {a.reason}</p>}
                  </div>
                  {canCancel && (
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      {a.teleconsult && a.meetingRoom && (
                        <a href={meetingUrl(a.meetingRoom)} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg">
                          <Video className="h-4 w-4" /> Join video
                        </a>
                      )}
                      <Button variant="outline" onClick={() => setReschedule(a)}><CalendarClock className="h-4 w-4" /> Reschedule</Button>
                      <Button variant="outline" onClick={() => setCancelId(a.id)}><X className="h-4 w-4" /> Cancel</Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {bookOpen && <BookModal doctors={doctors} onClose={() => setBookOpen(false)} onDone={load} />}
      {reschedule && <RescheduleModal appt={reschedule} onClose={() => setReschedule(null)} onDone={load} />}
      {cancelId && (
        <ConfirmDialog
          open title="Cancel appointment?"
          message="This will cancel your appointment. You can book a new one anytime."
          confirmLabel="Cancel appointment" onConfirm={doCancel} onClose={() => setCancelId(null)}
        />
      )}
    </div>
  );
}
