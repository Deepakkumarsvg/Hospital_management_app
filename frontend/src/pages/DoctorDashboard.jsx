import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, Users, Clock, Stethoscope, AlertCircle } from 'lucide-react';
import Card from '../components/ui/Card.jsx';
import Badge from '../components/ui/Badge.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getMyDoctorProfile } from '../services/doctorService.js';
import { listAppointments } from '../services/appointmentService.js';
import { toDateInput, APPOINTMENT_STATUS_META } from '../utils/constants.js';

function Stat({ label, value, icon: Icon }) {
  return (
    <Card className="flex items-center justify-between">
      <div>
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      </div>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface"><Icon className="h-5 w-5" /></span>
    </Card>
  );
}

export default function DoctorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(undefined); // undefined=loading, null=unlinked
  const [today, setToday] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const doc = await getMyDoctorProfile();
        setProfile(doc);
        if (doc) {
          const { items } = await listAppointments({ doctor: doc.id || doc._id, date: toDateInput(new Date().toISOString()), limit: 50 });
          setToday(items);
        }
      } catch {
        setProfile(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Spinner full />;

  // Doctor account not linked to a doctor profile yet.
  if (!profile) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-semibold">Welcome, {user?.name?.split(' ')[0]}</h1>
        <Card>
          <EmptyState
            icon={AlertCircle}
            title="No doctor profile linked"
            description="Your login isn't linked to a doctor profile yet. Ask an administrator to link your account under Doctors → Edit → Linked Login."
          />
        </Card>
      </div>
    );
  }

  const pending = today.filter((a) => ['BOOKED', 'CHECKED_IN', 'IN_PROGRESS'].includes(a.status));
  const uniquePatients = new Set(today.map((a) => a.patient?.uhid).filter(Boolean)).size;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Welcome, {profile.fullName}</h1>
        <p className="mt-1 text-sm text-muted">{profile.specialization} · {profile.department?.name}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Today's Appointments" value={today.length} icon={CalendarCheck} />
        <Stat label="Pending Consultations" value={pending.length} icon={Clock} />
        <Stat label="Patients Today" value={uniquePatients} icon={Users} />
      </div>

      <Card className="!p-0">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Stethoscope className="h-4 w-4" /> Today's Schedule</h2>
        </div>
        {today.length === 0 ? (
          <EmptyState icon={CalendarCheck} title="No appointments today" description="Enjoy the quiet — nothing on your schedule." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Patient</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {today.sort((a, b) => a.time.localeCompare(b.time)).map((a) => {
                  const meta = APPOINTMENT_STATUS_META[a.status] || { label: a.status, tone: 'neutral' };
                  return (
                    <tr key={a.id || a._id} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface"
                      onClick={() => navigate('/appointments')}>
                      <td className="px-4 py-3 font-medium tabular-nums">{a.time}</td>
                      <td className="px-4 py-3">{a.patient?.firstName} {a.patient?.lastName} <span className="font-mono text-xs text-muted">{a.patient?.uhid}</span></td>
                      <td className="px-4 py-3"><Badge>{a.type}</Badge></td>
                      <td className="px-4 py-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
