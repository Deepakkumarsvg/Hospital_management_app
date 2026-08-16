import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pill } from 'lucide-react';
import Badge from '../../components/ui/Badge.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listVisits } from '../../services/opdService.js';
import { formatDate } from '../../utils/constants.js';

// Prescriptions live inside OPD visits; aggregate them into a per-visit view.
export default function PatientPrescriptions({ patientId }) {
  const toast = useToast();
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listVisits({ patient: patientId, limit: 50 })
      .then((r) => setVisits(r.items.filter((v) => (v.prescription || []).length > 0)))
      .catch((err) => toast.error(err.message || 'Failed to load prescriptions'))
      .finally(() => setLoading(false));
  }, [patientId, toast]);

  if (loading) return <ListSkeleton card />;
  if (visits.length === 0) return <EmptyState icon={Pill} title="No prescriptions" description="No medicines have been prescribed to this patient yet." />;

  return (
    <div className="space-y-4">
      {visits.map((v) => (
        <div key={v.id || v._id} className="overflow-hidden rounded-lg border border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <Link to={`/opd/${v.id || v._id}`} className="font-mono text-xs font-medium hover:underline">{v.visitNo}</Link>
              <span className="text-muted">Dr. {v.doctor?.firstName} {v.doctor?.lastName}</span>
            </div>
            <span className="text-xs text-muted">{formatDate(v.visitDate)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 font-medium">Medicine</th>
                  <th className="px-4 py-2 font-medium">Dosage</th>
                  <th className="px-4 py-2 font-medium">Frequency</th>
                  <th className="px-4 py-2 font-medium">Duration</th>
                  <th className="px-4 py-2 font-medium">Route</th>
                  <th className="px-4 py-2 font-medium">Instructions</th>
                </tr>
              </thead>
              <tbody>
                {v.prescription.map((m, i) => (
                  <tr key={i} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2 font-medium">{m.medicine}</td>
                    <td className="px-4 py-2">{m.dosage || '—'}</td>
                    <td className="px-4 py-2">{m.frequency || '—'}</td>
                    <td className="px-4 py-2">{m.duration || '—'}</td>
                    <td className="px-4 py-2"><Badge>{m.route}</Badge></td>
                    <td className="px-4 py-2 text-muted">{m.instructions || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
