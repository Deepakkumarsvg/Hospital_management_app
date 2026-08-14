import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Scan, CalendarClock, CheckCircle2, XCircle, FileText, Save, Printer } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getRadOrder, changeRadStatus, submitRadReport } from '../../services/radiologyService.js';
import { CAN_RAD_STATUS, CAN_RAD_PROCESS, RAD_STATUS_META, RAD_NEXT, formatDateTime } from '../../utils/constants.js';

const ACTION = {
  SCHEDULED: { label: 'Schedule', icon: CalendarClock },
  COMPLETED: { label: 'Mark Completed', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancel', icon: XCircle, danger: true },
};

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

  const doStatus = async (s) => {
    setBusy(true);
    try { setOrder(await changeRadStatus(id, s)); toast.success(`Marked ${RAD_STATUS_META[s].label}`); load(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setBusy(false); }
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
        {order.status === 'REPORTED' && <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print Report</Button>}
      </div>

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Scan className="h-5 w-5 text-muted" />
            <h1 className="text-xl font-semibold">{order.patient?.firstName} {order.patient?.lastName}</h1>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted"><span className="font-mono">{order.orderNo}</span> · {order.patient?.uhid} · {order.testName} ({order.modality}) · {formatDateTime(order.createdAt)}</p>
        </div>
        {nexts.length > 0 && (
          <div className="flex flex-wrap gap-2 print:hidden">
            {nexts.map((s) => {
              const a = ACTION[s]; const Icon = a.icon;
              return <Button key={s} variant={a.danger ? 'outline' : 'primary'} onClick={() => doStatus(s)} loading={busy} className={a.danger ? '!text-red-500' : ''}><Icon className="h-4 w-4" /> {a.label}</Button>;
            })}
          </div>
        )}
      </Card>

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
