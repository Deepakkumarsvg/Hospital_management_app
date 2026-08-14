import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BedDouble, Plus } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Select from '../../components/ui/Select.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import AdmitForm from './AdmitForm.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listAdmissions } from '../../services/ipdService.js';
import { CAN_IPD_ADMIT, IPD_STATUS_META, formatDate } from '../../utils/constants.js';

const STATUS_FILTER = [
  { value: 'ALL', label: 'All status' },
  { value: 'ADMITTED', label: 'Admitted' },
  { value: 'DISCHARGED', label: 'Discharged' },
];

export default function IpdList() {
  const { role } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const canAdmit = CAN_IPD_ADMIT.includes(role);

  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 20 } });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listAdmissions({ page, limit: 20, status }));
    } catch (err) {
      toast.error(err.message || 'Failed to load admissions');
    } finally {
      setLoading(false);
    }
  }, [page, status, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const { items, pagination } = data;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">IPD Admissions</h1>
          <p className="mt-0.5 text-sm text-muted">{pagination.total} admission{pagination.total === 1 ? '' : 's'}</p>
        </div>
        {canAdmit && <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> Admit Patient</Button>}
      </div>

      <div className="w-full sm:w-48">
        <Select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} options={STATUS_FILTER} />
      </div>

      <div className="card overflow-hidden">
        {loading ? <Spinner full /> : items.length === 0 ? (
          <EmptyState icon={BedDouble} title="No admissions"
            description={canAdmit ? 'Admit a patient to allocate a bed and start inpatient care.' : 'Nothing here yet.'}
            action={canAdmit ? <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> Admit Patient</Button> : null} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">Admission No</th>
                    <th className="px-4 py-3 font-medium">Patient</th>
                    <th className="px-4 py-3 font-medium">Doctor</th>
                    <th className="px-4 py-3 font-medium">Bed</th>
                    <th className="px-4 py-3 font-medium">Admitted</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => {
                    const id = a.id || a._id;
                    const meta = IPD_STATUS_META[a.status] || { label: a.status, tone: 'neutral' };
                    return (
                      <tr key={id} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface" onClick={() => navigate(`/ipd/${id}`)}>
                        <td className="px-4 py-3 font-mono text-xs">{a.admissionNo}</td>
                        <td className="px-4 py-3"><div className="font-medium">{a.patient?.firstName} {a.patient?.lastName}</div><div className="font-mono text-xs text-muted">{a.patient?.uhid}</div></td>
                        <td className="px-4 py-3">Dr. {a.admittingDoctor?.firstName} {a.admittingDoctor?.lastName}</td>
                        <td className="px-4 py-3">{a.ward?.name} · {a.room?.roomNo} · {a.bed?.bedNo}</td>
                        <td className="px-4 py-3">{formatDate(a.admissionDate)}</td>
                        <td className="px-4 py-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} limit={pagination.limit} onChange={setPage} />
          </>
        )}
      </div>

      <AdmitForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={(a) => navigate(`/ipd/${a.id || a._id}`)} />
    </div>
  );
}
