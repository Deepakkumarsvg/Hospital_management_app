import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, ClipboardList, BedDouble, FlaskConical, Scan, Stethoscope, CalendarCheck, Download, Printer,
  IndianRupee, Wallet, TrendingUp, Pill, Boxes, Truck, AlertTriangle, RefreshCw, ArrowUp, ArrowDown, FileDown, Clock,
  UserRound,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  LineChart, Line,
} from 'recharts';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getReportSummary, getDoctorActivity, exportSummary, downloadSummaryPdf, exportInvoices, exportDoctorActivity } from '../../services/reportService.js';
import {
  money, APPOINTMENT_STATUS_META, OPD_STATUS_META, IPD_STATUS_META, LAB_STATUS_META, RAD_STATUS_META,
} from '../../utils/constants.js';

// delta: signed % change vs the previous period of equal length (null when
// there's no prior period to compare against, e.g. "All time").
function Delta({ value }) {
  if (value == null) return null;
  const up = value > 0;
  const flat = value === 0;
  return (
    <span className={'inline-flex items-center gap-0.5 text-xs font-medium ' + (flat ? 'text-muted' : up ? 'text-green-600 dark:text-green-400' : 'text-red-500')}>
      {!flat && (up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      {flat ? '±0%' : `${Math.abs(value)}%`}
    </span>
  );
}

function Tile({ label, value, icon: Icon, delta, onClick }) {
  return (
    <Card
      className={'!p-4' + (onClick ? ' cursor-pointer text-left transition-colors hover:bg-surface' : '')}
      {...(onClick ? { onClick, role: 'button', tabIndex: 0, onKeyDown: (e) => e.key === 'Enter' && onClick() } : {})}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">{label}</p>
        <Icon className="h-4 w-4 text-muted" />
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        <Delta value={delta} />
      </div>
    </Card>
  );
}

// Monochrome ink ramp (decreasing opacity) — matches the app's black & white
// system instead of introducing hue, and flips correctly with the theme
// since --fg itself is theme-aware.
const INK_RAMP = [95, 78, 63, 50, 38, 28, 20].map((a) => `rgb(var(--fg) / ${a}%)`);

// Status colors are reserved (never reused as generic series colors) and
// mirror the same tone→hex used elsewhere via the Badge component, so a
// "Cancelled" bar reads the same red here as its badge everywhere else.
const TONE_HEX = { success: '#0ca30c', warning: '#fab219', danger: '#d03b3b', neutral: 'rgb(var(--muted))' };

const TOOLTIP_STYLE = { background: 'rgb(var(--elevated))', border: '1px solid rgb(var(--border))', borderRadius: 10, fontSize: 12, color: 'rgb(var(--fg))' };

function BreakdownCard({ title, rows, statusMeta }) {
  const data = (rows || []).map((r) => ({ name: statusMeta?.[r.status]?.label || r.status, count: r.count, tone: statusMeta?.[r.status]?.tone || 'neutral' }));
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {data.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No data.</p>
      ) : (
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 20, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
              <XAxis type="number" allowDecimals={false} fontSize={11} stroke="rgb(var(--muted))" />
              <YAxis type="category" dataKey="name" width={110} fontSize={11} stroke="rgb(var(--muted))" />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgb(var(--fg) / 6%)' }} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {data.map((d, i) => <Cell key={i} fill={TONE_HEX[d.tone]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

const RANGE_PRESETS = [
  { key: 'today', label: 'Today', days: 0 },
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: 'month', label: 'This month', month: true },
  { key: 'year', label: 'This year', year: true },
  { key: 'all', label: 'All time', all: true },
];

function toISODate(d) { return d.toISOString().slice(0, 10); }

function computePreset(preset) {
  const now = new Date();
  if (preset.all) return { from: '', to: '' };
  if (preset.year) return { from: toISODate(new Date(now.getFullYear(), 0, 1)), to: toISODate(now) };
  if (preset.month) return { from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toISODate(now) };
  const from = new Date(now); from.setDate(from.getDate() - preset.days);
  return { from: toISODate(from), to: toISODate(now) };
}

export default function Reports() {
  const toast = useToast();
  const navigate = useNavigate();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [activePreset, setActivePreset] = useState('all');
  const [data, setData] = useState(null);
  const [docActivity, setDocActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    const params = { from: from || undefined, to: to || undefined };
    try {
      const [summary, activity] = await Promise.all([getReportSummary(params), getDoctorActivity(params)]);
      setData(summary);
      setDocActivity(activity);
      setLastLoadedAt(new Date());
    } catch (err) {
      setError(true);
      toast.error(err.message || 'Failed to load report');
    } finally { setLoading(false); }
  }, [from, to, toast]);

  useEffect(() => { load(); }, [load]);

  const range = { from: from || undefined, to: to || undefined };
  const doExport = (fn, fmt, key) => {
    setExporting(key);
    fn(fmt, range).catch((e) => toast.error(e.message || 'Export failed')).finally(() => setExporting(null));
  };
  const doExportPdf = () => {
    setExporting('pdf');
    downloadSummaryPdf(range).catch((e) => toast.error(e.message || 'PDF failed')).finally(() => setExporting(null));
  };

  const applyPreset = (preset) => {
    setActivePreset(preset.key);
    const { from: f, to: t } = computePreset(preset);
    setFrom(f); setTo(t);
  };

  const t = data?.totals || {};
  const beds = data?.beds || {};
  const rev = data?.revenue || {};
  const pharmacy = data?.pharmacy || {};
  const inventory = data?.inventory || {};
  const ambulance = data?.ambulance || {};
  const hr = data?.hr || {};

  return (
    <div className="space-y-5">
      <div className="card flex flex-col gap-3 p-5 print:hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Reports</h1>
            <p className="mt-0.5 text-sm text-muted">Hospital-wide summary{data?.range?.from || data?.range?.to ? ' for the selected range' : ' (all time)'}.</p>
            {lastLoadedAt && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                <Clock className="h-3 w-3" /> Updated {lastLoadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                <button onClick={load} className="ml-1 inline-flex items-center gap-0.5 text-fg hover:underline"><RefreshCw className="h-3 w-3" /> Refresh</button>
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-36"><Input type="date" label="From" value={from} onChange={(e) => { setFrom(e.target.value); setActivePreset('custom'); }} /></div>
            <div className="w-36"><Input type="date" label="To" value={to} onChange={(e) => { setTo(e.target.value); setActivePreset('custom'); }} /></div>
            <Button variant="outline" onClick={doExportPdf} loading={exporting === 'pdf'}><FileDown className="h-4 w-4" /> PDF</Button>
            <Button variant="outline" onClick={() => doExport(exportSummary, 'xlsx', 'summary')} loading={exporting === 'summary'}><Download className="h-4 w-4" /> Summary .xlsx</Button>
            <Button variant="outline" onClick={() => doExport(exportInvoices, 'csv', 'invoices')} loading={exporting === 'invoices'}><Download className="h-4 w-4" /> Invoices .csv</Button>
            <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RANGE_PRESETS.map((p) => (
            <button key={p.key} onClick={() => applyPreset(p)}
              className={'rounded-full border px-3 py-1 text-xs font-medium transition-colors ' +
                (activePreset === p.key ? 'border-fg bg-fg text-bg' : 'border-border text-muted hover:text-fg hover:bg-surface')}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? <Spinner full /> : error ? (
        <EmptyState icon={AlertTriangle} title="Could not load the report" description="Something went wrong fetching the summary."
          action={<Button onClick={load}><RefreshCw className="h-4 w-4" /> Retry</Button>} />
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Tile label="Patients" value={t.patients} icon={Users} delta={data.deltas?.patients} onClick={() => navigate('/patients')} />
            <Tile label="OPD Visits" value={t.opdVisits} icon={ClipboardList} delta={data.deltas?.opdVisits} onClick={() => navigate('/opd')} />
            <Tile label="IPD Admissions" value={t.ipdAdmissions} icon={BedDouble} delta={data.deltas?.ipdAdmissions} onClick={() => navigate('/ipd')} />
            <Tile label="Current Admissions" value={t.currentAdmissions} icon={BedDouble} onClick={() => navigate('/ipd')} />
            <Tile label="Lab Orders" value={t.labOrders} icon={FlaskConical} delta={data.deltas?.labOrders} onClick={() => navigate('/laboratory')} />
            <Tile label="Radiology Orders" value={t.radOrders} icon={Scan} delta={data.deltas?.radOrders} onClick={() => navigate('/radiology')} />
            <Tile label="Active Doctors" value={t.activeDoctors} icon={Stethoscope} onClick={() => navigate('/doctors')} />
            <Tile label="Bed Occupancy" value={`${beds.occupancyRate}%`} icon={CalendarCheck} onClick={() => navigate('/beds')} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-1">
              <div className="grid grid-cols-3 gap-4">
                <Tile label="Billed" value={money(rev.billed)} icon={IndianRupee} onClick={() => navigate('/billing')} />
                <Tile label="Collected" value={money(rev.collected)} icon={Wallet} delta={data.deltas?.collected} onClick={() => navigate('/billing')} />
                <Tile label="Due" value={money(rev.due)} icon={TrendingUp} onClick={() => navigate('/billing')} />
              </div>
              <Card>
                <h2 className="mb-3 text-sm font-semibold">Billed vs Collected vs Due</h2>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[{ name: 'Amount', billed: rev.billed, collected: rev.collected, due: rev.due }]} layout="vertical" margin={{ left: 0, right: 12 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" hide />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [money(v), n[0].toUpperCase() + n.slice(1)]} />
                      <Bar dataKey="billed" fill={INK_RAMP[0]} radius={[4, 4, 4, 4]} barSize={18} />
                      <Bar dataKey="collected" fill={INK_RAMP[2]} radius={[4, 4, 4, 4]} barSize={18} />
                      <Bar dataKey="due" fill={INK_RAMP[4]} radius={[4, 4, 4, 4]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-1 flex justify-center gap-4 text-xs text-muted">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: INK_RAMP[0] }} /> Billed</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: INK_RAMP[2] }} /> Collected</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: INK_RAMP[4] }} /> Due</span>
                </div>
              </Card>
            </div>
            <Card className="lg:col-span-1">
              <h2 className="mb-3 text-sm font-semibold">Revenue by Category</h2>
              {(rev.byCategory || []).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">No revenue yet.</p>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rev.byCategory} layout="vertical" margin={{ left: 20, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
                      <XAxis type="number" fontSize={11} stroke="rgb(var(--muted))" />
                      <YAxis type="category" dataKey="category" width={90} fontSize={11} stroke="rgb(var(--muted))" />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgb(var(--fg) / 6%)' }}
                        formatter={(v) => {
                          const total = (rev.byCategory || []).reduce((s, r) => s + r.amount, 0);
                          const pct = total ? Math.round((v / total) * 100) : 0;
                          return [`${money(v)} (${pct}%)`, 'Amount'];
                        }} />
                      <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                        {(rev.byCategory || []).map((_, i) => <Cell key={i} fill={INK_RAMP[i % INK_RAMP.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
            <Card className="lg:col-span-1">
              <h2 className="mb-3 text-sm font-semibold">Collection Trend</h2>
              {(rev.trend || []).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">No payments yet.</p>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rev.trend} margin={{ left: 10, right: 12, top: 6 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
                      <XAxis dataKey="date" fontSize={10} stroke="rgb(var(--muted))" tickFormatter={(d) => d?.slice(5)} />
                      <YAxis fontSize={10} stroke="rgb(var(--muted))" width={44} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => money(v)} />
                      <Line type="monotone" dataKey="amount" stroke="rgb(var(--fg) / 75%)" strokeWidth={2} dot={{ r: 2, fill: 'rgb(var(--fg))' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <Card>
            <h2 className="mb-3 text-sm font-semibold">Bed Status</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              {[['Total', beds.total], ['Available', beds.available], ['Occupied', beds.occupied], ['Reserved', beds.reserved], ['Maintenance', beds.maintenance]].map(([l, v]) => (
                <div key={l} className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted">{l}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
          </Card>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted">Operations</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <Tile label="Active Medicines" value={pharmacy.activeMedicines} icon={Pill} onClick={() => navigate('/pharmacy')} />
              <Tile label="Low Stock (Pharmacy)" value={pharmacy.lowStock} icon={AlertTriangle} onClick={() => navigate('/pharmacy')} />
              <Tile label="Dispense Revenue" value={money(pharmacy.dispenseRevenue)} icon={IndianRupee} onClick={() => navigate('/pharmacy')} />
              <Tile label="Low Stock (Inventory)" value={inventory.lowStock} icon={Boxes} onClick={() => navigate('/inventory')} />
              <Tile label="Open Purchase Orders" value={inventory.openPOs} icon={ClipboardList} onClick={() => navigate('/inventory')} />
              <Tile label="Ambulance Trips" value={ambulance.trips} icon={Truck} onClick={() => navigate('/ambulance')} />
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted">Human Resources</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Tile label="Active Staff" value={hr.activeStaff} icon={UserRound} onClick={() => navigate('/hr')} />
              <Tile label="Pending Leaves" value={hr.pendingLeaves} icon={CalendarCheck} onClick={() => navigate('/hr')} />
              <Tile label="Payroll Cost" value={money(hr.payrollCost)} icon={Wallet} onClick={() => navigate('/hr')} />
              <Tile label="Payroll Paid" value={money(hr.payrollPaid)} icon={IndianRupee} onClick={() => navigate('/hr')} />
            </div>
          </div>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Doctor Activity</h2>
              <div className="flex gap-2 print:hidden">
                <Button variant="ghost" className="h-8" onClick={() => doExport(exportDoctorActivity, 'xlsx', 'doc-xlsx')} loading={exporting === 'doc-xlsx'}><Download className="h-3.5 w-3.5" /> .xlsx</Button>
                <Button variant="ghost" className="h-8" onClick={() => doExport(exportDoctorActivity, 'csv', 'doc-csv')} loading={exporting === 'doc-csv'}><Download className="h-3.5 w-3.5" /> .csv</Button>
              </div>
            </div>
            {docActivity.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No activity in this range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted">
                      <th className="py-2 pr-3 font-medium">Doctor</th>
                      <th className="py-2 pr-3 font-medium">Specialization</th>
                      <th className="py-2 pr-3 text-right font-medium">Appts</th>
                      <th className="py-2 pr-3 text-right font-medium">Completed</th>
                      <th className="py-2 pr-3 text-right font-medium">OPD</th>
                      <th className="py-2 text-right font-medium">Est. Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docActivity.map((d, i) => (
                      <tr key={i} className="border-b border-border/60">
                        <td className="py-2 pr-3 font-medium">{d.doctor}</td>
                        <td className="py-2 pr-3 text-muted">{d.specialization}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{d.appointments}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{d.completed}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{d.opdVisits}</td>
                        <td className="py-2 text-right tabular-nums">{money(d.estConsultRevenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BreakdownCard title="Appointments by Status" rows={data.breakdowns.appointments} statusMeta={APPOINTMENT_STATUS_META} />
            <BreakdownCard title="OPD Visits by Status" rows={data.breakdowns.opd} statusMeta={OPD_STATUS_META} />
            <BreakdownCard title="IPD Admissions by Status" rows={data.breakdowns.ipd} statusMeta={IPD_STATUS_META} />
            <BreakdownCard title="Lab Orders by Status" rows={data.breakdowns.lab} statusMeta={LAB_STATUS_META} />
            <BreakdownCard title="Radiology by Status" rows={data.breakdowns.radiology} statusMeta={RAD_STATUS_META} />
          </div>
        </>
      )}
    </div>
  );
}
