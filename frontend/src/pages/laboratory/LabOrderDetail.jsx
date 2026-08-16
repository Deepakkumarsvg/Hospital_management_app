import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, FlaskConical, TestTube, Cog, CheckCircle2, ShieldCheck, XCircle, Save, Printer, FileDown,
} from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getLabOrder, changeLabStatus, enterLabResults, downloadLabReportPdf } from '../../services/labService.js';
import {
  CAN_LAB_STATUS, CAN_LAB_PROCESS, LAB_STATUS_META, LAB_NEXT, RESULT_FLAG_OPTIONS, formatDateTime,
} from '../../utils/constants.js';

const ACTION = {
  SAMPLE_COLLECTED: { label: 'Collect Sample', icon: TestTube },
  PROCESSING: { label: 'Start Processing', icon: Cog },
  COMPLETED: { label: 'Mark Completed', icon: CheckCircle2 },
  VERIFIED: { label: 'Verify', icon: ShieldCheck },
  CANCELLED: { label: 'Cancel', icon: XCircle, danger: true },
};

// Best-effort auto-flag from a numeric result vs. a "lo-hi", "<n" or ">n"
// reference range — still editable afterward, just saves the common case.
function suggestFlag(referenceRange, result) {
  if (!referenceRange || result === '' || result == null) return null;
  const val = parseFloat(result);
  if (Number.isNaN(val)) return null;
  const range = referenceRange.trim();

  let m = /^(-?\d+\.?\d*)\s*-\s*(-?\d+\.?\d*)$/.exec(range);
  if (m) {
    const lo = parseFloat(m[1]); const hi = parseFloat(m[2]);
    if (val < lo) return 'LOW';
    if (val > hi) return 'HIGH';
    return 'NORMAL';
  }
  m = /^[<≤]\s*(-?\d+\.?\d*)$/.exec(range);
  if (m) return val > parseFloat(m[1]) ? 'HIGH' : 'NORMAL';
  m = /^[>≥]\s*(-?\d+\.?\d*)$/.exec(range);
  if (m) return val < parseFloat(m[1]) ? 'LOW' : 'NORMAL';
  return null;
}

export default function LabOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const toast = useToast();
  const canStatus = CAN_LAB_STATUS.includes(role);
  const canProcess = CAN_LAB_PROCESS.includes(role);

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const o = await getLabOrder(id);
      setOrder(o);
      setRows((o.items || []).map((i) => ({ ...i })));
    } catch (err) { toast.error(err.message || 'Not found'); navigate('/laboratory'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (loading) return <Spinner full />;
  if (!order) return null;

  const meta = LAB_STATUS_META[order.status] || { label: order.status, tone: 'neutral' };
  const nexts = canStatus ? (LAB_NEXT[order.status] || []) : [];
  const canEditResults = canProcess && ['SAMPLE_COLLECTED', 'PROCESSING', 'COMPLETED'].includes(order.status);

  const doStatus = async (s) => {
    setBusy(true);
    try { setOrder(await changeLabStatus(id, s)); toast.success(`Marked ${LAB_STATUS_META[s].label}`); load(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setBusy(false); }
  };
  const saveResults = async () => {
    setBusy(true);
    try {
      const updated = await enterLabResults(id, rows.map((r) => ({ name: r.name, unit: r.unit, referenceRange: r.referenceRange, result: r.result, flag: r.flag, price: r.price })));
      setOrder(updated); toast.success('Results saved'); load();
    } catch (err) { toast.error(err.message || 'Failed'); } finally { setBusy(false); }
  };
  const setRow = (i, k, v) => setRows((prev) => prev.map((r, idx) => {
    if (idx !== i) return r;
    const updated = { ...r, [k]: v };
    if (k === 'result') {
      const suggested = suggestFlag(r.referenceRange, v);
      if (suggested) updated.flag = suggested;
    }
    return updated;
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between print:hidden">
        <Link to="/laboratory" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" /> Back to Laboratory</Link>
        {order.status === 'VERIFIED' && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print Report</Button>
            <Button variant="outline" onClick={() => downloadLabReportPdf(order.id || order._id, order.orderNo).catch((e) => toast.error(e.message || 'PDF failed'))}>
              <FileDown className="h-4 w-4" /> Download PDF
            </Button>
          </div>
        )}
      </div>

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-muted" />
            <h1 className="text-xl font-semibold">{order.patient?.firstName} {order.patient?.lastName}</h1>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted"><span className="font-mono">{order.orderNo}</span> · {order.patient?.uhid}{order.doctor ? ` · Dr. ${order.doctor.firstName} ${order.doctor.lastName}` : ''} · {formatDateTime(order.createdAt)}</p>
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
                <Button key={s} variant={a.danger ? 'outline' : 'primary'} onClick={() => doStatus(s)} loading={busy}
                  className={a.danger ? '!text-red-500' : ''}><Icon className="h-4 w-4" /> {a.label}</Button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Results / result-entry table */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Test Results</h2>
          {canEditResults && <Button variant="outline" className="h-8 print:hidden" onClick={saveResults} loading={busy}><Save className="h-4 w-4" /> Save Results</Button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">Test</th><th className="px-3 py-2 font-medium">Result</th>
                <th className="px-3 py-2 font-medium">Unit</th><th className="px-3 py-2 font-medium">Reference</th>
                <th className="px-3 py-2 font-medium">Flag</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2">
                    {canEditResults ? <Input className="!py-1.5" value={r.result || ''} onChange={(e) => setRow(i, 'result', e.target.value)} /> : (r.result || '—')}
                  </td>
                  <td className="px-3 py-2 text-muted">{r.unit || '—'}</td>
                  <td className="px-3 py-2 text-muted">{r.referenceRange || '—'}</td>
                  <td className="px-3 py-2">
                    {canEditResults ? <Select className="!py-1.5" options={RESULT_FLAG_OPTIONS} value={r.flag || 'NORMAL'} onChange={(e) => setRow(i, 'flag', e.target.value)} />
                      : <Badge tone={r.flag === 'NORMAL' ? 'success' : r.flag === 'ABNORMAL' ? 'danger' : 'warning'}>{r.flag}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {order.notes && <p className="mt-4 text-sm text-muted">Notes: {order.notes}</p>}
      </Card>

      {order.status === 'VERIFIED' && (
        <p className="text-sm text-muted print:mt-8">
          Verified by {order.verifiedBy?.name || 'doctor'} on {formatDateTime(order.verifiedAt)}.
        </p>
      )}
    </div>
  );
}
