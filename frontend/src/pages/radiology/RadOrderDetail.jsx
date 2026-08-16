import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Scan, CalendarClock, CheckCircle2, XCircle, FileText, Save, Printer, FileDown } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getRadOrder, changeRadStatus, submitRadReport, downloadRadReportPdf } from '../../services/radiologyService.js';
import { CAN_RAD_STATUS, CAN_RAD_PROCESS, RAD_STATUS_META, RAD_NEXT, formatDateTime } from '../../utils/constants.js';

const ACTION = {
  SCHEDULED: { label: 'Schedule', icon: CalendarClock },
  COMPLETED: { label: 'Mark Completed', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancel', icon: XCircle, danger: true },
};

// datetime-local input needs "YYYY-MM-DDTHH:mm" in local time.
function toDateTimeLocal(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function RadOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const toast = useToast();
  const canStatus = CAN_RAD_STATUS.includes(role);
  const canProcess = CAN_RAD_PROCESS.includes(role);

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [findings, setFindings] = useState('');
  const [impression, setImpression] = useState('');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const o = await getRadOrder(id);
      setOrder(o); setFindings(o.findings || ''); setImpression(o.impression || '');
    } catch (err) { toast.error(err.message || 'Not found'); navigate('/radiology'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (loading) return <Spinner full />;
  if (!order) return null;

  const meta = RAD_STATUS_META[order.status] || { label: order.status, tone: 'neutral' };
  const nexts = canStatus ? (RAD_NEXT[order.status] || []) : [];
  const canReport = canProcess && ['COMPLETED', 'REPORTED'].includes(order.status);

  const doStatus = async (s, at) => {
    setBusy(true);
    try { setOrder(await changeRadStatus(id, s, at)); toast.success(`Marked ${RAD_STATUS_META[s].label}`); load(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setBusy(false); }
  };
  const openSchedule = () => { setScheduledAt(toDateTimeLocal(order.scheduledAt)); setScheduleOpen(true); };
  const confirmSchedule = async () => {
    await doStatus('SCHEDULED', scheduledAt ? new Date(scheduledAt).toISOString() : undefined);
    setScheduleOpen(false);
  };
  const saveReport = async () => {
    setBusy(true);
    try { setOrder(await submitRadReport(id, { findings, impression })); toast.success('Report submitted'); load(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between print:hidden">
        <Link to="/radiology" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" /> Back to Radiology</Link>
        {order.status === 'REPORTED' && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print Report</Button>
            <Button variant="outline" onClick={() => downloadRadReportPdf(order.id || order._id, order.orderNo).catch((e) => toast.error(e.message || 'PDF failed'))}>
              <FileDown className="h-4 w-4" /> Download PDF
            </Button>
          </div>
        )}
      </div>

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Scan className="h-5 w-5 text-muted" />
            <h1 className="text-xl font-semibold">{order.patient?.firstName} {order.patient?.lastName}</h1>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted"><span className="font-mono">{order.orderNo}</span> · {order.patient?.uhid}{order.doctor ? ` · Dr. ${order.doctor.firstName} ${order.doctor.lastName}` : ''} · {order.testName} ({order.modality}) · {formatDateTime(order.createdAt)}</p>
          {order.opdVisit && (
            <Link to={`/opd/${order.opdVisit.id || order.opdVisit._id}`} className="mt-1 inline-block text-xs text-muted hover:text-fg hover:underline print:hidden">
              From OPD visit {order.opdVisit.visitNo} →
            </Link>
          )}
        </div>
        {nexts.length > 0 && (
          <div className="flex flex-wrap gap-2 print:hidden">
            {nexts.map((s) => {
              const a = ACTION[s]; const Icon = a.icon;
              return (
                <Button key={s} variant={a.danger ? 'outline' : 'primary'} onClick={() => (s === 'SCHEDULED' ? openSchedule() : doStatus(s))} loading={busy} className={a.danger ? '!text-red-500' : ''}>
                  <Icon className="h-4 w-4" /> {a.label}
                </Button>
              );
            })}
          </div>
        )}
      </Card>

      <Modal open={scheduleOpen} onClose={() => setScheduleOpen(false)} title="Schedule Investigation"
        footer={<><Button variant="outline" onClick={() => setScheduleOpen(false)} disabled={busy}>Cancel</Button><Button onClick={confirmSchedule} loading={busy}>Confirm</Button></>}>
        <div>
          <label className="label">Scheduled Date &amp; Time</label>
          <input type="datetime-local" className="input" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        </div>
      </Modal>

      <Card>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4" /> Report</h2>
        {canReport ? (
          <div className="space-y-4">
            <div>
              <label className="label">Findings</label>
              <textarea rows={5} className="input resize-y" value={findings} onChange={(e) => setFindings(e.target.value)} placeholder="Radiological findings…" />
            </div>
            <div>
              <label className="label">Impression</label>
              <textarea rows={3} className="input resize-y" value={impression} onChange={(e) => setImpression(e.target.value)} placeholder="Summary / impression…" />
            </div>
            <div className="print:hidden"><Button onClick={saveReport} loading={busy}><Save className="h-4 w-4" /> Submit Report</Button></div>
          </div>
        ) : order.status === 'REPORTED' ? (
          <div className="space-y-4">
            <div><p className="text-xs uppercase tracking-wide text-muted">Findings</p><p className="mt-1 whitespace-pre-wrap text-sm">{order.findings || '—'}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-muted">Impression</p><p className="mt-1 whitespace-pre-wrap text-sm font-medium">{order.impression || '—'}</p></div>
            <p className="text-sm text-muted print:mt-8">Reported by {order.reportedBy?.name || 'radiologist'} on {formatDateTime(order.reportedAt)}.</p>
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-muted">The report can be entered once the investigation is marked <span className="font-medium">Completed</span>.</p>
        )}
        {order.notes && <p className="mt-4 text-sm text-muted">Clinical note: {order.notes}</p>}
      </Card>
    </div>
  );
}
