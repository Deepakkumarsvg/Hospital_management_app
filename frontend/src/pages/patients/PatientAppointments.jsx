import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Plus } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import AppointmentForm from '../appointments/AppointmentForm.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listAppointments } from '../../services/appointmentService.js';
import { CAN_BOOK_APPT, APPOINTMENT_STATUS_META, formatDate } from '../../utils/constants.js';

export default function PatientAppointments({ patient }) {
  const { role } = useAuth();
  const toast = useToast();
  const canBook = CAN_BOOK_APPT.includes(role);
  const patientId = patient.id || patient._id;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { items } = await listAppointments({ patient: patientId, limit: 50 });
      setItems(items);
    } catch (err) {
      toast.error(err.message || 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, [patientId, toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-3">
        {items.length > 0 && (
          <Link to={`/appointments?patient=${patientId}`} className="text-sm text-muted hover:text-fg hover:underline">
            View all in Appointments →
          </Link>
        )}
        {canBook && (
          <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> Book Appointment</Button>
        )}
      </div>

      {loading ? (
        <Spinner full />
      ) : items.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No appointments"
          description={canBook ? 'Book an appointment for this patient.' : 'No appointments yet.'}
          action={canBook ? <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> Book Appointment</Button> : null} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Appt No</th>
                <th className="px-4 py-3 font-medium">Doctor</th>
                <th className="px-4 py-3 font-medium">Date / Time</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => {
                const meta = APPOINTMENT_STATUS_META[a.status] || { label: a.status, tone: 'neutral' };
                return (
                  <tr key={a.id || a._id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                    <td className="px-4 py-3 font-mono text-xs">{a.appointmentNo}</td>
                    <td className="px-4 py-3">Dr. {a.doctor?.firstName} {a.doctor?.lastName}<div className="text-xs text-muted">{a.doctor?.specialization}</div></td>
                    <td className="px-4 py-3">{formatDate(a.date)} <span className="text-muted tabular-nums">{a.time}</span></td>
                    <td className="px-4 py-3"><Badge>{a.type}</Badge></td>
                    <td className="px-4 py-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AppointmentForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={load} presetPatient={patient} />
    </div>
  );
}
