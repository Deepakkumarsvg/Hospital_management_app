import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, CalendarCheck, Stethoscope, IndianRupee, FlaskConical, Pill,
  BedDouble, ClipboardList, TrendingUp, ArrowRight, CalendarDays, Droplet,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useAuth } from '../context/AuthContext.jsx';
import Card from '../components/ui/Card.jsx';
import Badge from '../components/ui/Badge.jsx';
import { PageSkeleton } from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import DoctorDashboard from './DoctorDashboard.jsx';
import { getDashboard } from '../services/reportService.js';
import { navFor } from '../utils/navigation.js';
import { money, APPOINTMENT_STATUS_META } from '../utils/constants.js';

// Monochrome palette to match the black & white system.
// One hue at descending strength rather than five unrelated colours: the
// slices of a single measure are the same kind of thing, so shade carries the
// distinction and the chart still reads correctly in greyscale or print.
// Built from --accent, so it is blue in light and white in dark automatically.
const PIE_SHADES = [92, 74, 56, 40, 26].map((a) => `rgb(var(--accent) / ${a}%)`);

// Reads a CSS var so chart strokes flip with the theme.
// Axes and gridlines stay neutral on purpose — the accent is reserved for the
// data itself, so the chrome never competes with the series. Resolved by the
// browser from the theme variable, which means a theme toggle recolours them
// immediately without a re-render.
const AXIS = 'rgb(var(--muted))';

const ChartTooltip = {
  contentStyle: {
    background: 'rgb(var(--elevated))',
    border: '1px solid rgb(var(--border))',
    borderRadius: 12,
    color: 'rgb(var(--fg))',
    fontSize: 12,
  },
};

function StatCard({ label, value, icon: Icon }) {
  return (
    <Card className="flex items-center justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm text-muted">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      </div>
      {/* Tinted rather than grey: nine identical neutral tiles gave the eye
          nothing to land on, and the icon is the only thing distinguishing one
          card from the next. A wash of the accent at 10% keeps it quiet enough
          that the number still leads. */}
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/15 bg-accent/10 text-accent">
        <Icon className="h-5 w-5" />
      </span>
    </Card>
  );
}

// Resolves to null instead of throwing so one blocked/failed endpoint
// (role-restricted or module not deployed) doesn't break the whole page.
async function settle(fn) {
  try { return await fn(); } catch { return null; }
}

export default function Dashboard() {
  const { user, role, can } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (role === 'DOCTOR') return; // doctor gets its own dashboard
    let active = true;

    (async () => {
      // One request for the whole page. This used to be eleven parallel calls —
      // one per module's stats endpoint — each of which re-authenticated,
      // re-resolved the tenant and fanned out its own queries, with most of the
      // results thrown away for roles that couldn't see them. The server now
      // assembles only the sections this caller is allowed, so a section being
      // absent still means "no access", exactly as before.
      const d = await settle(getDashboard);
      if (!active) return;

      setData(d && {
        patients: d.patients,
        appt: d.appointments && { today: d.appointments.today, total: d.appointments.total },
        doctors: d.doctors,
        opd: d.opd,
        ipd: d.ipd,
        lab: d.lab,
        pharmacy: d.pharmacy,
        billing: d.billing,
        blood: d.blood,
        todayAppts: d.appointments?.upcoming || null,
        // Kept in the shape the charts below already read.
        summary: (d.beds || d.billing || d.appointments) && {
          beds: d.beds,
          revenue: { trend: d.billing?.trend || [] },
          breakdowns: { appointments: d.appointments?.breakdown || [] },
        },
      });
    })();

    return () => { active = false; };
  }, [role]);

  // Doctors see a focused, personal dashboard.
  if (role === 'DOCTOR') return <DoctorDashboard />;
  if (!data) return <PageSkeleton />;

  const { patients, appt, doctors, opd, ipd, lab, pharmacy, billing, blood, summary, todayAppts } = data;

  // Every card below is real data — the card only appears if the caller's
  // role actually has access to that module's stats endpoint.
  const stats = [
    patients && { label: 'Total Patients', value: patients.total.toLocaleString('en-IN'), icon: Users },
    appt && { label: "Today's Appointments", value: appt.today, icon: CalendarCheck },
    doctors && { label: 'Active Doctors', value: doctors.active, icon: Stethoscope },
    opd && { label: "Today's OPD Visits", value: opd.today, icon: ClipboardList },
    ipd && { label: 'Current Admissions', value: ipd.current, icon: BedDouble },
    lab && { label: 'Pending Lab Tests', value: lab.pending, icon: FlaskConical },
    pharmacy && { label: 'Low Stock Medicines', value: pharmacy.lowStock, icon: Pill },
    blood && { label: 'Blood Units Expiring (7d)', value: blood.expiringSoon, icon: Droplet },
    billing && { label: 'Revenue Collected', value: money(billing.collected), icon: IndianRupee },
  ].filter(Boolean);

  // Each section is granted independently now, so a caller can have revenue
  // without beds. Guard on the section itself rather than on `summary`.
  const beds = summary?.beds;
  const bedData = beds
    ? [
        { name: 'Occupied', value: beds.occupied },
        { name: 'Available', value: beds.available },
        { name: 'Reserved', value: beds.reserved },
        { name: 'Maintenance', value: beds.maintenance },
      ].filter((d) => d.value > 0)
    : [];

  const apptBreakdown =
    summary?.breakdowns?.appointments?.map((r) => ({
      status: APPOINTMENT_STATUS_META[r.status]?.label || r.status,
      count: r.count,
    })) || [];

  const quickLinks = navFor({ can, isSuperAdmin: role === 'SUPER_ADMIN' }).filter((i) => !['Dashboard', 'Settings'].includes(i.label) && !i.todo).slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {user?.name?.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-muted">Here's what's happening in your hospital today.</p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted sm:self-auto">
          <CalendarDays className="h-4 w-4" />
          {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      {stats.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <StatCard key={s.label} {...s} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState title="No data available" description="Your role doesn't have access to any dashboard statistics yet." />
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Today's appointments */}
        <Card className="!p-0 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CalendarCheck className="h-4 w-4" /> Today's Appointments
            </h2>
            {todayAppts && todayAppts.length > 0 && (
              <button onClick={() => navigate('/appointments')} className="flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {!todayAppts ? (
            <EmptyState title="Not available" description="You don't have access to appointment data." />
          ) : todayAppts.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="No appointments today" description="Nothing scheduled for today yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">Time</th>
                    <th className="px-4 py-3 font-medium">Patient</th>
                    <th className="px-4 py-3 font-medium">Doctor</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...todayAppts]
                    .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
                    .map((a) => {
                      const meta = APPOINTMENT_STATUS_META[a.status] || { label: a.status, tone: 'neutral' };
                      return (
                        <tr
                          key={a.id || a._id}
                          className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface"
                          onClick={() => navigate('/appointments')}
                        >
                          <td className="px-4 py-3 font-medium tabular-nums">{a.time}</td>
                          <td className="px-4 py-3">{a.patient?.firstName} {a.patient?.lastName}</td>
                          <td className="px-4 py-3 text-muted">Dr. {a.doctor?.firstName} {a.doctor?.lastName}</td>
                          <td className="px-4 py-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Quick access */}
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Quick Access</h2>
          <div className="grid grid-cols-2 gap-2">
            {quickLinks.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={() => navigate(item.to)}
                  className="flex flex-col items-start gap-2 rounded-lg border border-border p-3 text-left text-xs font-medium transition-colors hover:bg-elevated"
                >
                  <Icon className="h-[18px] w-[18px] text-muted" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Analytics. Each card is granted independently — finance sees the
          collection trend, clinical staff see bed occupancy, and whoever has
          both sees both. */}
      {(billing || beds || apptBreakdown.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {billing && (
          <Card className="lg:col-span-2">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted" />
              <h2 className="text-sm font-semibold">Collection Trend (Last 30 Days)</h2>
            </div>
            <div className="h-64">
              {summary.revenue.trend.length === 0 ? (
                <EmptyState title="No payments yet" description="Collection trend will appear once payments are recorded." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={summary.revenue.trend} margin={{ left: -20, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={AXIS} strokeOpacity={0.15} />
                    <XAxis dataKey="date" stroke={AXIS} fontSize={11} tickLine={false} tickFormatter={(v) => v.slice(5)} minTickGap={24} />
                    <YAxis stroke={AXIS} fontSize={12} tickLine={false} />
                    <Tooltip {...ChartTooltip} formatter={(v) => money(v)} />
                    <Area type="monotone" dataKey="amount" stroke="rgb(var(--accent))" strokeWidth={2} fill="url(#rev)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
          )}

          {beds && (
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <BedDouble className="h-4 w-4 text-muted" />
              <h2 className="text-sm font-semibold">Bed Occupancy</h2>
              <span className="ml-auto text-xs text-muted">{beds.occupancyRate}% full</span>
            </div>
            <div className="h-64">
              {bedData.length === 0 ? (
                <EmptyState title="No beds configured" description="Add beds under Beds to see occupancy here." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={bedData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                      {bedData.map((_, i) => (
                        <Cell key={i} fill={PIE_SHADES[i % PIE_SHADES.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...ChartTooltip} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
          )}

          {apptBreakdown.length > 0 && (
          <Card className="lg:col-span-3">
            <div className="mb-4 flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted" />
              <h2 className="text-sm font-semibold">Appointment Status Breakdown</h2>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={apptBreakdown} margin={{ left: -20, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={AXIS} strokeOpacity={0.15} />
                  <XAxis dataKey="status" stroke={AXIS} fontSize={12} tickLine={false} />
                  <YAxis stroke={AXIS} fontSize={12} tickLine={false} allowDecimals={false} />
                  <Tooltip {...ChartTooltip} cursor={{ fill: AXIS, fillOpacity: 0.08 }} />
                  <Bar dataKey="count" name="Appointments" fill="rgb(var(--accent) / 85%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          )}
        </div>
      )}
    </div>
  );
}
