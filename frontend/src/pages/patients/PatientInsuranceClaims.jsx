import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import Badge from '../../components/ui/Badge.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listClaims } from '../../services/insuranceService.js';
import { CLAIM_STATUS_META, money, formatDate } from '../../utils/constants.js';

export default function PatientInsuranceClaims({ patientId }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listClaims({ patient: patientId, limit: 50 })
      .then((r) => setItems(r.items))
      .catch((err) => toast.error(err.message || 'Failed to load claims'))
      .finally(() => setLoading(false));
  }, [patientId, toast]);

  if (loading) return <ListSkeleton card />;
  if (items.length === 0) return <EmptyState icon={ShieldCheck} title="No insurance claims" description="This patient has no insurance claims yet." />;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link to="/insurance" className="text-sm text-muted hover:text-fg hover:underline">
          View all in Insurance →
        </Link>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-2 font-medium">Claim No</th><th className="px-4 py-2 font-medium">Insurer</th>
            <th className="px-4 py-2 font-medium">Claimed</th><th className="px-4 py-2 font-medium">Approved</th>
            <th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 font-medium">Status</th>
          </tr></thead>
          <tbody>
            {items.map((c) => {
              const meta = CLAIM_STATUS_META[c.status] || { label: c.status, tone: 'neutral' };
              return (
                <tr key={c.id || c._id} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface" onClick={() => navigate(`/insurance/${c.id || c._id}`)}>
                  <td className="px-4 py-2 font-mono text-xs">{c.claimNo}</td>
                  <td className="px-4 py-2">{c.insuranceCompany}</td>
                  <td className="px-4 py-2 tabular-nums">{money(c.claimAmount)}</td>
                  <td className="px-4 py-2 tabular-nums">{c.approvedAmount ? money(c.approvedAmount) : '—'}</td>
                  <td className="px-4 py-2">{formatDate(c.createdAt)}</td>
                  <td className="px-4 py-2"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
