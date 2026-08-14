import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, FileText, FlaskConical, Receipt, IndianRupee, ArrowRight } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getPortalSummary, getPortalAppointments } from '../../services/portalService.js';
import { APPOINTMENT_STATUS_META, money, formatDate } from '../../utils/constants.js';

function Tile({ label, value, icon: Icon, to }) {
  const body = (
    <Card className="!p-4 transition-colors hover:border-fg/30">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">{label}</p>
        <Icon className="h-4 w-4 text-muted" />
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export default function PortalDashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const [summary, setSummary] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getPortalSummary(), getPortalAppointments()])
      .then(([s, appts]) => {
        setSummary(s);
        const now = new Date(); now.setHours(0, 0, 0, 0);
        setUpcoming(appts.filter((a) => ['BOOKED', 'CHECKED_IN'].includes(a.status) && new Date(a.date) >= now).slice(0, 3));
      })
      .catch((e) => toast.error(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [toast]);

  if (loading) return <Spinner full />;
  const s = summary || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Hi, {user?.name?.split(' ')[0] || 'there'} 👋</h1>
        <p className="mt-0.5 text-sm text-muted">Welcome to your patient portal.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Appointments" value={s.appointments ?? 0} icon={CalendarDays} to="/portal/appointments" />
        <Tile label="Upcoming" value={s.upcoming ?? 0} icon={CalendarDays} to="/portal/appointments" />
        <Tile label="Prescriptions" value={s.prescriptions ?? 0} icon={FileText} to="/portal/records" />
        <Tile label="Lab Orders" value={s.labOrders ?? 0} icon={FlaskConical} to="/portal/records" />
        <Tile label="Amount Due" value={money(s.totalDue ?? 0)} icon={IndianRupee} to="/portal/bills" />
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Upcoming appointments</h2>
          <Link to="/portal/appointments" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
            Book / manage <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No upcoming appointments. Book one from the Appointments tab.</p>
        ) : (
          <ul className="divide-y divide-border">
            {upcoming.map((a) => {
              const meta = APPOINTMENT_STATUS_META[a.status] || {};
              return (
                <li key={a.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">Dr. {a.doctor?.firstName} {a.doctor?.lastName}
                      <span className="text-muted"> · {a.doctor?.specialization}</span></p>
                    <p className="text-xs text-muted">{formatDate(a.date)} at {a.time} · {a.department?.name}</p>
                  </div>
                  <Badge tone={meta.tone}>{meta.label || a.status}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
