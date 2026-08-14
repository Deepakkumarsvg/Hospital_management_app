import { useEffect, useState, useCallback } from 'react';
import {
  BarChart3, Users, ClipboardList, BedDouble, FlaskConical, Scan, Stethoscope, CalendarCheck, Download, Printer,
  IndianRupee, Wallet, TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  LineChart, Line,
} from 'recharts';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getReportSummary, getDoctorActivity, exportInvoices, exportDoctorActivity } from '../../services/reportService.js';
import { money } from '../../utils/constants.js';

function Tile({ label, value, icon: Icon }) {
  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">{label}</p>
        <Icon className="h-4 w-4 text-muted" />
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </Card>
  );
}

const SHADES = ['#171717', '#525252', '#737373', '#a3a3a3', '#d4d4d4', '#e5e5e5'];

function BreakdownCard({ title, rows }) {
  const data = (rows || []).map((r) => ({ name: r.status, count: r.count }));
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {data.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No data.</p>
      ) : (
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 20, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#8884" horizontal={false} />
              <XAxis type="number" allowDecimals={false} fontSize={11} stroke="#888" />
              <YAxis type="category" dataKey="name" width={110} fontSize={11} stroke="#888" />
              <Tooltip contentStyle={{ background: 'rgb(var(--elevated))', border: '1px solid rgb(var(--border))', borderRadius: 10, fontSize: 12 }} cursor={{ fill: '#8882' }} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {data.map((_, i) => <Cell key={i} fill={SHADES[i % SHADES.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

export default function Reports() {
  const toast = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState(null);
  const [docActivity, setDocActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = { from: from || undefined, to: to || undefined };
    try {
      const [summary, activity] = await Promise.all([getReportSummary(params), getDoctorActivity(params)]);
      setData(summary);
      setDocActivity(activity);
    } catch (err) { toast.error(err.message || 'Failed to load report'); }
    finally { setLoading(false); }
  }, [from, to, toast]);

  const range = { from: from || undefined, to: to || undefined };
  const doExport = (fn, fmt) => fn(fmt, range).catch((e) => toast.error(e.message || 'Export failed'));

  useEffect(() => { load(); }, [load]);

  const exportCsv = () => {
    if (!data) return;
    const lines = [['Metric', 'Value']];
    Object.entries(data.totals).forEach(([k, v]) => lines.push([k, v]));
    Object.entries(data.beds).forEach(([k, v]) => lines.push([`beds_${k}`, v]));
    for (const [group, rows] of Object.entries(data.breakdowns)) {
      rows.forEach((r) => lines.push([`${group}_${r.status}`, r.count]));
    }
    const csv = lines.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `hms-report-${from || 'all'}_${to || 'all'}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const t = data?.totals || {};
  const beds = data?.beds || {};
  const rev = data?.revenue || {};

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden">
        <div>
          <h1 className="text-xl font-semibold">Reports</h1>
          <p className="mt-0.5 text-sm text-muted">Hospital-wide summary{data?.range?.from || data?.range?.to ? ' for the selected range' : ' (all time)'}.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-36"><Input type="date" label="From" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="w-36"><Input type="date" label="To" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          {(from || to) && <Button variant="ghost" onClick={() => { setFrom(''); setTo(''); }}>Clear</Button>}
          <Button variant="outline" onClick={() => doExport(exportInvoices, 'xlsx')}><Download className="h-4 w-4" /> Invoices .xlsx</Button>
          <Button variant="outline" onClick={() => doExport(exportInvoices, 'csv')}><Download className="h-4 w-4" /> Invoices .csv</Button>
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
        </div>
      </div>

      {loading ? <Spinner full /> : !data ? null : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Tile label="Patients" value={t.patients} icon={Users} />
            <Tile label="OPD Visits" value={t.opdVisits} icon={ClipboardList} />
            <Tile label="IPD Admissions" value={t.ipdAdmissions} icon={BedDouble} />
            <Tile label="Current Admissions" value={t.currentAdmissions} icon={BedDouble} />
            <Tile label="Lab Orders" value={t.labOrders} icon={FlaskConical} />
            <Tile label="Radiology Orders" value={t.radOrders} icon={Scan} />
            <Tile label="Active Doctors" value={t.activeDoctors} icon={Stethoscope} />
            <Tile label="Bed Occupancy" value={`${beds.occupancyRate}%`} icon={CalendarCheck} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="grid grid-cols-3 gap-4 lg:col-span-1">
              <Tile label="Billed" value={money(rev.billed)} icon={IndianRupee} />
              <Tile label="Collected" value={money(rev.collected)} icon={Wallet} />
              <Tile label="Due" value={money(rev.due)} icon={TrendingUp} />
            </div>
            <Card className="lg:col-span-1">
              <h2 className="mb-3 text-sm font-semibold">Revenue by Category</h2>
              {(rev.byCategory || []).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">No revenue yet.</p>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rev.byCategory} layout="vertical" margin={{ left: 20, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#8884" horizontal={false} />
                      <XAxis type="number" fontSize={11} stroke="#888" />
                      <YAxis type="category" dataKey="category" width={90} fontSize={11} stroke="#888" />
                      <Tooltip contentStyle={{ background: 'rgb(var(--elevated))', border: '1px solid rgb(var(--border))', borderRadius: 10, fontSize: 12 }} cursor={{ fill: '#8882' }} formatter={(v) => money(v)} />
                      <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                        {(rev.byCategory || []).map((_, i) => <Cell key={i} fill={SHADES[i % SHADES.length]} />)}
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
                      <CartesianGrid strokeDasharray="3 3" stroke="#8884" />
                      <XAxis dataKey="date" fontSize={10} stroke="#888" tickFormatter={(d) => d?.slice(5)} />
                      <YAxis fontSize={10} stroke="#888" width={44} />
                      <Tooltip contentStyle={{ background: 'rgb(var(--elevated))', border: '1px solid rgb(var(--border))', borderRadius: 10, fontSize: 12 }} formatter={(v) => money(v)} />
                      <Line type="monotone" dataKey="amount" stroke="#888" strokeWidth={2} dot={{ r: 2 }} />
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

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Doctor Activity</h2>
              <div className="flex gap-2 print:hidden">
                <Button variant="ghost" className="h-8" onClick={() => doExport(exportDoctorActivity, 'xlsx')}><Download className="h-3.5 w-3.5" /> .xlsx</Button>
                <Button variant="ghost" className="h-8" onClick={() => doExport(exportDoctorActivity, 'csv')}><Download className="h-3.5 w-3.5" /> .csv</Button>
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
            <BreakdownCard title="Appointments by Status" rows={data.breakdowns.appointments} />
            <BreakdownCard title="OPD Visits by Status" rows={data.breakdowns.opd} />
            <BreakdownCard title="Lab Orders by Status" rows={data.breakdowns.lab} />
            <BreakdownCard title="Radiology by Status" rows={data.breakdowns.radiology} />
          </div>
        </>
      )}
    </div>
  );
}
