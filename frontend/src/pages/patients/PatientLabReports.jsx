import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FlaskConical, Scan } from 'lucide-react';
import Badge from '../../components/ui/Badge.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listLabOrders } from '../../services/labService.js';
import { listRadOrders } from '../../services/radiologyService.js';
import { LAB_STATUS_META, RAD_STATUS_META, formatDate } from '../../utils/constants.js';

export default function PatientLabReports({ patientId }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [lab, setLab] = useState([]);
  const [rad, setRad] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      listLabOrders({ patient: patientId, limit: 50 }),
      listRadOrders({ patient: patientId, limit: 50 }),
    ])
      .then(([l, r]) => { setLab(l.items); setRad(r.items); })
      .catch((err) => toast.error(err.message || 'Failed to load reports'))
      .finally(() => setLoading(false));
  }, [patientId, toast]);

  if (loading) return <ListSkeleton card />;
  if (lab.length === 0 && rad.length === 0) {
    return <EmptyState icon={FlaskConical} title="No diagnostics" description="No lab or radiology orders for this patient yet." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><FlaskConical className="h-4 w-4" /> Laboratory</h3>
          {lab.length > 0 && (
            <Link to={`/laboratory?patient=${patientId}`} className="text-sm text-muted hover:text-fg hover:underline">
              View all →
            </Link>
          )}
        </div>
        {lab.length === 0 ? <p className="text-sm text-muted">No lab orders.</p> : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">Order No</th><th className="px-4 py-2 font-medium">Tests</th>
                <th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 font-medium">Status</th>
              </tr></thead>
              <tbody>
                {lab.map((o) => {
                  const m = LAB_STATUS_META[o.status] || { label: o.status, tone: 'neutral' };
                  return (
                    <tr key={o.id || o._id} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface" onClick={() => navigate(`/laboratory/${o.id || o._id}`)}>
                      <td className="px-4 py-2 font-mono text-xs">{o.orderNo}</td>
                      <td className="px-4 py-2 text-muted">{o.items?.map((i) => i.name).slice(0, 3).join(', ')}</td>
                      <td className="px-4 py-2">{formatDate(o.createdAt)}</td>
                      <td className="px-4 py-2"><Badge tone={m.tone}>{m.label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Scan className="h-4 w-4" /> Radiology</h3>
          {rad.length > 0 && (
            <Link to={`/radiology?patient=${patientId}`} className="text-sm text-muted hover:text-fg hover:underline">
              View all →
            </Link>
          )}
        </div>
        {rad.length === 0 ? <p className="text-sm text-muted">No radiology orders.</p> : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">Order No</th><th className="px-4 py-2 font-medium">Investigation</th>
                <th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 font-medium">Status</th>
              </tr></thead>
              <tbody>
                {rad.map((o) => {
                  const m = RAD_STATUS_META[o.status] || { label: o.status, tone: 'neutral' };
                  return (
                    <tr key={o.id || o._id} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface" onClick={() => navigate(`/radiology/${o.id || o._id}`)}>
                      <td className="px-4 py-2 font-mono text-xs">{o.orderNo}</td>
                      <td className="px-4 py-2">{o.testName} <span className="text-xs text-muted">({o.modality})</span></td>
                      <td className="px-4 py-2">{formatDate(o.createdAt)}</td>
                      <td className="px-4 py-2"><Badge tone={m.tone}>{m.label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
