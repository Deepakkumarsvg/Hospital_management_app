import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BedDouble } from 'lucide-react';
import Badge from '../../components/ui/Badge.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listAdmissions } from '../../services/ipdService.js';
import { IPD_STATUS_META, formatDate } from '../../utils/constants.js';

export default function PatientAdmissions({ patientId }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAdmissions({ patient: patientId, limit: 50 })
      .then((r) => setItems(r.items))
      .catch((err) => toast.error(err.message || 'Failed to load admissions'))
      .finally(() => setLoading(false));
  }, [patientId, toast]);

  if (loading) return <ListSkeleton card />;
  if (items.length === 0) return <EmptyState icon={BedDouble} title="No admissions" description="This patient has no inpatient admissions yet." />;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full min-w-[680px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3 font-medium">Admission No</th>
            <th className="px-4 py-3 font-medium">Doctor</th>
            <th className="px-4 py-3 font-medium">Bed</th>
            <th className="px-4 py-3 font-medium">Admitted</th>
            <th className="px-4 py-3 font-medium">Discharged</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => {
            const meta = IPD_STATUS_META[a.status] || { label: a.status, tone: 'neutral' };
            return (
              <tr key={a.id || a._id} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface" onClick={() => navigate(`/ipd/${a.id || a._id}`)}>
                <td className="px-4 py-3 font-mono text-xs">{a.admissionNo}</td>
                <td className="px-4 py-3">Dr. {a.admittingDoctor?.firstName} {a.admittingDoctor?.lastName}</td>
                <td className="px-4 py-3">{a.ward?.name} · {a.room?.roomNo} · {a.bed?.bedNo}</td>
                <td className="px-4 py-3">{formatDate(a.admissionDate)}</td>
                <td className="px-4 py-3">{a.dischargeDate ? formatDate(a.dischargeDate) : '—'}</td>
                <td className="px-4 py-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
