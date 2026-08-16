import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Stethoscope, Phone, Mail, IndianRupee, Award, CalendarDays, CalendarCheck, CalendarClock } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import DoctorForm from './DoctorForm.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getDoctor } from '../../services/doctorService.js';
import { listAppointments } from '../../services/appointmentService.js';
import { CAN_MANAGE_ADMIN, WEEKDAYS, toDateInput } from '../../utils/constants.js';

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-sm">{value || '—'}</p>
    </div>
  );
}

export default function DoctorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const toast = useToast();
  const canManage = CAN_MANAGE_ADMIN.includes(role);

  const [doctor, setDoctor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [apptLoad, setApptLoad] = useState({ total: null, today: null });

  const load = async () => {
    setLoading(true);
    try {
      setDoctor(await getDoctor(id));
    } catch (err) {
      toast.error(err.message || 'Doctor not found');
      navigate('/doctors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  // Doctor's appointment load — total on record + today's count.
  useEffect(() => {
    if (!id) return;
    Promise.all([
      listAppointments({ doctor: id, limit: 1 }),
      listAppointments({ doctor: id, date: toDateInput(new Date().toISOString()), limit: 50 }),
    ])
      .then(([totalRes, todayRes]) => setApptLoad({ total: totalRes.pagination.total, today: todayRes.items.length }))
      .catch(() => setApptLoad({ total: null, today: null }));
  }, [id]);

  if (loading) return <Spinner full />;
  if (!doctor) return null;

  const availDays = (doctor.availability || []).map((a) => a.day);
  const initials = (doctor.firstName?.[0] || 'D') + (doctor.lastName?.[0] || '');

  return (
    <div className="space-y-5">
      <Link to="/doctors" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Back to Doctors
      </Link>

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-lg font-semibold text-accent-fg">
            {initials.toUpperCase()}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{doctor.fullName}</h1>
              <Badge tone={doctor.status === 'ACTIVE' ? 'success' : 'neutral'}>{doctor.status}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted">{doctor.specialization} · {doctor.department?.name}</p>
          </div>
        </div>
        {canManage && <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Edit</Button>}
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="!p-4"><p className="flex items-center gap-1.5 text-xs text-muted"><Award className="h-3.5 w-3.5" /> Experience</p><p className="mt-1 text-lg font-semibold">{doctor.experienceYears} yrs</p></Card>
        <Card className="!p-4"><p className="flex items-center gap-1.5 text-xs text-muted"><IndianRupee className="h-3.5 w-3.5" /> Fee</p><p className="mt-1 text-lg font-semibold">₹{doctor.consultationFee}</p></Card>
        <Card className="!p-4"><p className="flex items-center gap-1.5 text-xs text-muted"><Phone className="h-3.5 w-3.5" /> Phone</p><p className="mt-1 text-lg font-semibold tabular-nums">{doctor.phone}</p></Card>
        <Card className="!p-4"><p className="flex items-center gap-1.5 text-xs text-muted"><Stethoscope className="h-3.5 w-3.5" /> Reg No</p><p className="mt-1 text-sm font-mono font-semibold">{doctor.registrationNo}</p></Card>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="!p-4"><p className="flex items-center gap-1.5 text-xs text-muted"><CalendarCheck className="h-3.5 w-3.5" /> Today's Appointments</p><p className="mt-1 text-lg font-semibold">{apptLoad.today ?? '—'}</p></Card>
        <Card className="!p-4"><p className="flex items-center gap-1.5 text-xs text-muted"><CalendarClock className="h-3.5 w-3.5" /> Total Appointments</p><p className="mt-1 text-lg font-semibold">{apptLoad.total ?? '—'}</p></Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-sm font-semibold">Profile</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Qualification" value={doctor.qualification} />
            <Field label="Specialization" value={doctor.specialization} />
            <Field label="Department" value={doctor.department?.name} />
            <Field label="Email" value={doctor.email} />
            <div className="col-span-2">
              <Field label="Linked Login" value={doctor.user ? `${doctor.user.name} · ${doctor.user.email}` : 'Not linked'} />
            </div>
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4" /> Weekly Availability</h2>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => (
              <span key={d} className={'rounded-lg border px-3 py-1.5 text-xs font-medium ' +
                (availDays.includes(d) ? 'border-transparent bg-accent text-accent-fg' : 'border-border text-muted/60')}>
                {d}
              </span>
            ))}
          </div>
          {availDays.length === 0 && <p className="mt-3 text-sm text-muted">No availability set.</p>}
        </Card>
      </div>

      <DoctorForm open={editOpen} onClose={() => setEditOpen(false)} doctor={doctor} onSaved={load} />
    </div>
  );
}
