import { useEffect, useState } from 'react';
import {
  Users, CalendarCheck, Stethoscope, IndianRupee,
  FlaskConical, Pill, Activity, TrendingUp, BedDouble,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useAuth } from '../context/AuthContext.jsx';
import Card from '../components/ui/Card.jsx';
import DoctorDashboard from './DoctorDashboard.jsx';
import { getPatientStats } from '../services/patientService.js';
import { getAppointmentStats } from '../services/appointmentService.js';
import { getDoctorStats } from '../services/doctorService.js';

const REG_TREND = [
  { m: 'Mar', v: 120 }, { m: 'Apr', v: 168 }, { m: 'May', v: 145 },
  { m: 'Jun', v: 190 }, { m: 'Jul', v: 210 }, { m: 'Aug', v: 176 },
];
const OPD_IPD = [
  { m: 'Mon', opd: 42, ipd: 8 }, { m: 'Tue', opd: 55, ipd: 12 },
  { m: 'Wed', opd: 38, ipd: 9 }, { m: 'Thu', opd: 61, ipd: 14 },
  { m: 'Fri', opd: 49, ipd: 10 }, { m: 'Sat', opd: 70, ipd: 15 },
];
const DEPT = [
  { name: 'Cardiology', value: 320 }, { name: 'General Med', value: 480 },
  { name: 'Orthopedics', value: 260 }, { name: 'Emergency', value: 188 },
];
// Monochrome palette to match the black & white system.
const PIE_SHADES = ['#171717', '#525252', '#a3a3a3', '#d4d4d4'];

// Reads a CSS var so chart strokes flip with the theme.
function useAxisColor() {
  if (typeof window === 'undefined') return '#888';
  return getComputedStyle(document.documentElement).classList?.contains?.('dark')
    ? '#a3a3a3'
    : '#737373';
}

function StatCard({ label, value, icon: Icon }) {
  return (
    <Card className="flex items-center justify-between">
      <div>
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      </div>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface">
        <Icon className="h-5 w-5" />
      </span>
    </Card>
  );
}

const ChartTooltip = {
  contentStyle: {
    background: 'rgb(var(--elevated))',
    border: '1px solid rgb(var(--border))',
    borderRadius: 12,
    color: 'rgb(var(--fg))',
    fontSize: 12,
  },
};

export default function Dashboard() {
  const { user, role } = useAuth();
  const axis = useAxisColor();
  const [live, setLive] = useState(null);

  // Real counts for the modules that exist; the rest stay illustrative.
  useEffect(() => {
    if (role === 'DOCTOR') return; // doctor gets its own dashboard
    Promise.all([getPatientStats(), getAppointmentStats(), getDoctorStats()])
      .then(([p, a, d]) => setLive({ patients: p.total, apptToday: a.today, doctors: d.active }))
      .catch(() => setLive(null));
  }, [role]);

  // Doctors see a focused, personal dashboard.
  if (role === 'DOCTOR') return <DoctorDashboard />;

  const realStats = [
    { label: 'Total Patients', value: live ? live.patients.toLocaleString() : '—', icon: Users, real: true },
    { label: "Today's Appointments", value: live ? live.apptToday : '—', icon: CalendarCheck, real: true },
    { label: 'Active Doctors', value: live ? live.doctors : '—', icon: Stethoscope, real: true },
  ];
  const sampleStats = [
    { label: "Today's Revenue", value: '₹84,200', icon: IndianRupee },
    { label: 'Pending Lab Tests', value: '12', icon: FlaskConical },
    { label: 'Low Pharmacy Stock', value: '5', icon: Pill },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Welcome back, {user?.name?.split(' ')[0]} 👋</h1>
        <p className="mt-1 text-sm text-muted">Here's an overview of your hospital.</p>
      </div>

      {/* Live stat cards (real data) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {realStats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* Illustrative cards for modules not built yet */}
      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Sample — pending modules</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sampleStats.map((s) => (
            <StatCard key={s.label} {...s} />
          ))}
        </div>
      </div>

      {/* Charts (illustrative until trend data is aggregated) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted" />
            <h2 className="text-sm font-semibold">Patient Registration Trend</h2>
            <span className="ml-auto text-xs italic text-muted">sample</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={REG_TREND} margin={{ left: -20, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="reg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={axis} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={axis} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={axis} strokeOpacity={0.15} />
                <XAxis dataKey="m" stroke={axis} fontSize={12} tickLine={false} />
                <YAxis stroke={axis} fontSize={12} tickLine={false} />
                <Tooltip {...ChartTooltip} />
                <Area type="monotone" dataKey="v" stroke={axis} strokeWidth={2} fill="url(#reg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted" />
            <h2 className="text-sm font-semibold">Department-wise Patients</h2>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={DEPT} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                  {DEPT.map((_, i) => (
                    <Cell key={i} fill={PIE_SHADES[i % PIE_SHADES.length]} />
                  ))}
                </Pie>
                <Tooltip {...ChartTooltip} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="lg:col-span-3">
          <div className="mb-4 flex items-center gap-2">
            <BedDouble className="h-4 w-4 text-muted" />
            <h2 className="text-sm font-semibold">OPD vs IPD (This Week)</h2>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={OPD_IPD} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={axis} strokeOpacity={0.15} />
                <XAxis dataKey="m" stroke={axis} fontSize={12} tickLine={false} />
                <YAxis stroke={axis} fontSize={12} tickLine={false} />
                <Tooltip {...ChartTooltip} cursor={{ fill: axis, fillOpacity: 0.08 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="opd" name="OPD" fill="#171717" radius={[4, 4, 0, 0]} />
                <Bar dataKey="ipd" name="IPD" fill="#a3a3a3" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
