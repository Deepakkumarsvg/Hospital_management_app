import { useEffect, useState, useCallback } from 'react';
import { CalendarDays, Plus, Trash2, LogIn, PlayCircle, CheckCircle2, XCircle, UserX, CalendarClock } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Select from '../../components/ui/Select.jsx';
import Input from '../../components/ui/Input.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import AppointmentForm from './AppointmentForm.jsx';
import RescheduleModal from './RescheduleModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listAppointments, changeAppointmentStatus, deleteAppointment } from '../../services/appointmentService.js';
import {
  CAN_BOOK_APPT, CAN_UPDATE_APPT_STATUS, CAN_MANAGE_ADMIN,
  APPOINTMENT_STATUS_META, APPOINTMENT_NEXT, formatDate,
} from '../../utils/constants.js';

const STATUS_FILTER = [
  { value: 'ALL', label: 'All status' },
  ...Object.entries(APPOINTMENT_STATUS_META).map(([value, m]) => ({ value, label: m.label })),
];

// Icon + label for each actionable next-status.
const ACTION_META = {
  CHECKED_IN: { label: 'Check-in', icon: LogIn },
  IN_PROGRESS: { label: 'Start', icon: PlayCircle },
  COMPLETED: { label: 'Complete', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancel', icon: XCircle, danger: true },
  NO_SHOW: { label: 'No-show', icon: UserX, danger: true },
};

export default function AppointmentsList() {
  const { role } = useAuth();
  const toast = useToast();
  const canBook = CAN_BOOK_APPT.includes(role);
  const canStatus = CAN_UPDATE_APPT_STATUS.includes(role);
  const canDelete = CAN_MANAGE_ADMIN.includes(role);

  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 20 } });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('ALL');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [rescheduling, setRescheduling] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Reschedule is only meaningful before the visit is locked.
  const EDITABLE = ['BOOKED', 'CHECKED_IN'];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listAppointments({ page, limit: 20, status, date: date || undefined }));
    } catch (err) {
      toast.error(err.message || 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, [page, status, date, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const doStatus = async (appt, next) => {
    setBusyId(appt.id || appt._id);
    try {
      await changeAppointmentStatus(appt.id || appt._id, next);
      toast.success(`Marked ${APPOINTMENT_STATUS_META[next].label}`);
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Could not update status');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    setDeleteLoading(true);
    try {
      await deleteAppointment(deleting.id || deleting._id);
      toast.success('Appointment deleted');
      setDeleting(null);
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Delete failed');
    } finally {
      setDeleteLoading(false);
    }
  };

  const { items, pagination } = data;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Appointments</h1>
          <p className="mt-0.5 text-sm text-muted">{pagination.total} appointment{pagination.total === 1 ? '' : 's'}</p>
        </div>
        {canBook && <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> Book Appointment</Button>}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="w-full sm:w-48">
          <Select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} options={STATUS_FILTER} />
        </div>
        <div className="w-full sm:w-48">
          <Input type="date" value={date} onChange={(e) => { setPage(1); setDate(e.target.value); }} />
        </div>
        {date && <Button variant="ghost" onClick={() => { setPage(1); setDate(''); }}>Clear date</Button>}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <Spinner full />
        ) : items.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No appointments"
            description={canBook ? 'Book the first appointment.' : 'Nothing scheduled.'}
            action={canBook ? <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> Book Appointment</Button> : null} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">Appt No</th>
                    <th className="px-4 py-3 font-medium">Patient</th>
                    <th className="px-4 py-3 font-medium">Doctor</th>
                    <th className="px-4 py-3 font-medium">Date / Time</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => {
                    const id = a.id || a._id;
                    const meta = APPOINTMENT_STATUS_META[a.status] || { label: a.status, tone: 'neutral' };
                    const nexts = canStatus ? (APPOINTMENT_NEXT[a.status] || []) : [];
                    return (
                      <tr key={id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                        <td className="px-4 py-3 font-mono text-xs">{a.appointmentNo}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{a.patient ? `${a.patient.firstName} ${a.patient.lastName || ''}` : '—'}</div>
                          <div className="font-mono text-xs text-muted">{a.patient?.uhid}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div>Dr. {a.doctor?.firstName} {a.doctor?.lastName}</div>
                          <div className="text-xs text-muted">{a.doctor?.specialization}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div>{formatDate(a.date)}</div>
                          <div className="text-xs text-muted tabular-nums">{a.time}</div>
                        </td>
                        <td className="px-4 py-3"><Badge>{a.type}</Badge></td>
                        <td className="px-4 py-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            {nexts.map((n) => {
                              const am = ACTION_META[n];
                              const Icon = am.icon;
                              return (
                                <button
                                  key={n} onClick={() => doStatus(a, n)} disabled={busyId === id}
                                  title={am.label}
                                  className={'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ' +
                                    (am.danger ? 'border-red-500/30 text-red-500 hover:bg-red-500/10' : 'border-border hover:bg-elevated')}
                                >
                                  <Icon className="h-3.5 w-3.5" /> {am.label}
                                </button>
                              );
                            })}
                            {canBook && EDITABLE.includes(a.status) && (
                              <button onClick={() => setRescheduling(a)} className="btn-ghost h-7 w-7 !p-0" title="Reschedule / edit">
                                <CalendarClock className="h-4 w-4" />
                              </button>
                            )}
                            {canDelete && (
                              <button onClick={() => setDeleting(a)} className="btn-ghost h-7 w-7 !p-0 text-red-500 hover:bg-red-500/10" title="Delete">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} limit={pagination.limit} onChange={setPage} />
          </>
        )}
      </div>

      <AppointmentForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={fetchData} />
      <RescheduleModal open={!!rescheduling} onClose={() => setRescheduling(null)} appointment={rescheduling} onSaved={fetchData} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} loading={deleteLoading}
        title="Delete appointment?" message={deleting ? `Delete ${deleting.appointmentNo}? This cannot be undone.` : ''} confirmLabel="Delete" />
    </div>
  );
}
