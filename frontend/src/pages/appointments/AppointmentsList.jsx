import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CalendarDays, Plus, Trash2, LogIn, PlayCircle, CheckCircle2, XCircle, UserX, CalendarClock, X, Download, List, LayoutGrid, Clock, Stethoscope } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Select from '../../components/ui/Select.jsx';
import Input from '../../components/ui/Input.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import AppointmentForm from './AppointmentForm.jsx';
import RescheduleModal from './RescheduleModal.jsx';
import OpdStartForm from '../opd/OpdStartForm.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listAppointments, changeAppointmentStatus, deleteAppointment, exportAppointments } from '../../services/appointmentService.js';
import {
  CAN_BOOK_APPT, CAN_UPDATE_APPT_STATUS, CAN_MANAGE_ADMIN, CAN_OPD_EDIT,
  APPOINTMENT_STATUS_META, APPOINTMENT_NEXT, formatDate, toDateInput,
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

const EDITABLE = ['BOOKED', 'CHECKED_IN']; // reschedule is only meaningful before the visit is locked.

// Shared status/reschedule/delete actions — used by both the table and day-view rows.
function RowActions({ appt, canBook, canStatus, canDelete, canStartOpd, busyId, onStatus, onReschedule, onDelete, onStartOpd }) {
  const id = appt.id || appt._id;
  const nexts = canStatus ? (APPOINTMENT_NEXT[appt.status] || []) : [];
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {canStartOpd && appt.status === 'CHECKED_IN' && (
        <button
          onClick={() => onStartOpd(appt)}
          title="Start OPD visit"
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-elevated"
        >
          <Stethoscope className="h-3.5 w-3.5" /> Start OPD
        </button>
      )}
      {nexts.map((n) => {
        const am = ACTION_META[n];
        const Icon = am.icon;
        return (
          <button
            key={n} onClick={() => onStatus(appt, n)} disabled={busyId === id}
            title={am.label}
            className={'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ' +
              (am.danger ? 'border-red-500/30 text-red-500 hover:bg-red-500/10' : 'border-border hover:bg-elevated')}
          >
            <Icon className="h-3.5 w-3.5" /> {am.label}
          </button>
        );
      })}
      {canBook && EDITABLE.includes(appt.status) && (
        <button onClick={() => onReschedule(appt)} className="btn-ghost h-7 w-7 !p-0" title="Reschedule / edit">
          <CalendarClock className="h-4 w-4" />
        </button>
      )}
      {canDelete && (
        <button onClick={() => onDelete(appt)} className="btn-ghost h-7 w-7 !p-0 text-red-500 hover:bg-red-500/10" title="Delete">
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export default function AppointmentsList() {
  const { role } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const canBook = CAN_BOOK_APPT.includes(role);
  const canStatus = CAN_UPDATE_APPT_STATUS.includes(role);
  const canDelete = CAN_MANAGE_ADMIN.includes(role);
  const canStartOpd = CAN_OPD_EDIT.includes(role);

  const [searchParams, setSearchParams] = useSearchParams();
  const patientFilter = searchParams.get('patient') || '';

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
  const [exporting, setExporting] = useState(null); // 'csv' | 'xlsx' | null
  const [view, setView] = useState('list'); // 'list' | 'day'
  const [startingOpdAppt, setStartingOpdAppt] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Day view shows a whole day at once — skip pagination for it.
      const limit = view === 'day' ? 200 : 20;
      setData(await listAppointments({ page: view === 'day' ? 1 : page, limit, status, date: date || undefined, patient: patientFilter || undefined }));
    } catch (err) {
      toast.error(err.message || 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, [page, status, date, patientFilter, view, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const clearPatientFilter = () => {
    setPage(1);
    const next = new URLSearchParams(searchParams);
    next.delete('patient');
    setSearchParams(next);
  };

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

  const switchToDayView = () => {
    setView('day');
    if (!date) { setPage(1); setDate(toDateInput(new Date().toISOString())); }
  };

  const onExport = async (format) => {
    setExporting(format);
    try {
      await exportAppointments({ status, date, patient: patientFilter }, format);
    } catch (err) {
      toast.error(err.message || 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="card flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Appointments</h1>
          <p className="mt-0.5 text-sm text-muted">{pagination.total} appointment{pagination.total === 1 ? '' : 's'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" loading={exporting === 'csv'} disabled={!!exporting} onClick={() => onExport('csv')}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" loading={exporting === 'xlsx'} disabled={!!exporting} onClick={() => onExport('xlsx')}>
            <Download className="h-4 w-4" /> Excel
          </Button>
          {canBook && <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> Book Appointment</Button>}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="w-full sm:w-48">
          <Select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} options={STATUS_FILTER} />
        </div>
        <div className="w-full sm:w-48">
          <Input type="date" value={date} onChange={(e) => { setPage(1); setDate(e.target.value); }} />
        </div>
        {date && <Button variant="ghost" onClick={() => { setPage(1); setDate(''); }}>Clear date</Button>}
        <div className="inline-flex rounded-lg border border-border p-0.5">
          <button onClick={() => setView('list')} title="List view"
            className={'rounded-md p-1.5 transition-colors ' + (view === 'list' ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg')}>
            <List className="h-4 w-4" />
          </button>
          <button onClick={switchToDayView} title="Day / timeline view"
            className={'rounded-md p-1.5 transition-colors ' + (view === 'day' ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg')}>
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
        {patientFilter && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm">
            Filtered to one patient
            <button onClick={clearPatientFilter} className="text-muted hover:text-fg" aria-label="Clear patient filter">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <ListSkeleton />
        ) : items.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No appointments"
            description={canBook ? 'Book the first appointment.' : 'Nothing scheduled.'}
            action={canBook ? <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> Book Appointment</Button> : null} />
        ) : view === 'day' ? (
          <div className="divide-y divide-border">
            {Object.entries(
              items.reduce((byHour, a) => {
                const hour = (a.time || '00:00').slice(0, 2) + ':00';
                (byHour[hour] ||= []).push(a);
                return byHour;
              }, {})
            )
              .sort(([h1], [h2]) => h1.localeCompare(h2))
              .map(([hour, slotItems]) => (
                <div key={hour} className="flex gap-4 p-4">
                  <div className="w-16 shrink-0 pt-1 text-sm font-medium text-muted tabular-nums">{hour}</div>
                  <div className="flex-1 space-y-2">
                    {slotItems.sort((a, b) => a.time.localeCompare(b.time)).map((a) => {
                      const id = a.id || a._id;
                      const meta = APPOINTMENT_STATUS_META[a.status] || { label: a.status, tone: 'neutral' };
                      return (
                        <div key={id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1 text-sm font-semibold tabular-nums"><Clock className="h-3.5 w-3.5 text-muted" /> {a.time}</span>
                            <div>
                              <p className="text-sm font-medium">{a.patient ? `${a.patient.firstName} ${a.patient.lastName || ''}` : '—'} <span className="font-mono text-xs text-muted">{a.patient?.uhid}</span></p>
                              <p className="text-xs text-muted">Dr. {a.doctor?.firstName} {a.doctor?.lastName} · {a.doctor?.specialization}</p>
                            </div>
                            <Badge>{a.type}</Badge>
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                          </div>
                          <RowActions appt={a} canBook={canBook} canStatus={canStatus} canDelete={canDelete} canStartOpd={canStartOpd}
                            busyId={busyId} onStatus={doStatus} onReschedule={setRescheduling} onDelete={setDeleting} onStartOpd={setStartingOpdAppt} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
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
                          <RowActions appt={a} canBook={canBook} canStatus={canStatus} canDelete={canDelete} canStartOpd={canStartOpd}
                            busyId={busyId} onStatus={doStatus} onReschedule={setRescheduling} onDelete={setDeleting} onStartOpd={setStartingOpdAppt} />
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
      <OpdStartForm
        open={!!startingOpdAppt}
        onClose={() => setStartingOpdAppt(null)}
        onCreated={(v) => navigate(`/opd/${v.id || v._id}`)}
        presetPatient={startingOpdAppt?.patient}
        presetDoctor={startingOpdAppt?.doctor?.id || startingOpdAppt?.doctor?._id}
        presetDepartment={startingOpdAppt?.department?.id || startingOpdAppt?.department?._id}
        presetAppointment={startingOpdAppt?.id || startingOpdAppt?._id}
      />
    </div>
  );
}
