import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import Badge from '../../components/ui/Badge.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listVisits } from '../../services/opdService.js';
import { OPD_STATUS_META, formatDate } from '../../utils/constants.js';

export default function PatientOpdVisits({ patientId }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listVisits({ patient: patientId, limit: 50 })
      .then((r) => setItems(r.items))
      .catch((err) => toast.error(err.message || 'Failed to load OPD visits'))
      .finally(() => setLoading(false));
  }, [patientId, toast]);

  if (loading) return <Spinner full />;
  if (items.length === 0) return <EmptyState icon={ClipboardList} title="No OPD visits" description="This patient has no outpatient visits yet." />;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full min-w-[620px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3 font-medium">Visit No</th>
            <th className="px-4 py-3 font-medium">Doctor</th>
            <th className="px-4 py-3 font-medium">Diagnosis</th>
            <th className="px-4 py-3 font-medium">Meds</th>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((v) => {
            const meta = OPD_STATUS_META[v.status] || { label: v.status, tone: 'neutral' };
            return (
              <tr key={v.id || v._id} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface" onClick={() => navigate(`/opd/${v.id || v._id}`)}>
                <td className="px-4 py-3 font-mono text-xs">{v.visitNo}</td>
                <td className="px-4 py-3">Dr. {v.doctor?.firstName} {v.doctor?.lastName}</td>
                <td className="px-4 py-3 text-muted">{v.diagnosis || <span className="italic">pending</span>}</td>
                <td className="px-4 py-3 tabular-nums">{v.prescription?.length || 0}</td>
                <td className="px-4 py-3">{formatDate(v.visitDate)}</td>
                <td className="px-4 py-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
