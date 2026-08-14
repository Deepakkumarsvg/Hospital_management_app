import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus, Stethoscope } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Select from '../../components/ui/Select.jsx';
import Input from '../../components/ui/Input.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import OpdStartForm from './OpdStartForm.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listVisits } from '../../services/opdService.js';
import { CAN_OPD_EDIT, OPD_STATUS_META, formatDate } from '../../utils/constants.js';

const STATUS_FILTER = [
  { value: 'ALL', label: 'All status' },
  { value: 'OPEN', label: 'Open' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function OpdList() {
  const { role } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const canEdit = CAN_OPD_EDIT.includes(role);

  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 20 } });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('ALL');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listVisits({ page, limit: 20, status, date: date || undefined }));
    } catch (err) {
      toast.error(err.message || 'Failed to load OPD visits');
    } finally {
      setLoading(false);
    }
  }, [page, status, date, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const { items, pagination } = data;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">OPD Visits</h1>
          <p className="mt-0.5 text-sm text-muted">{pagination.total} visit{pagination.total === 1 ? '' : 's'}</p>
        </div>
        {canEdit && <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> New Visit</Button>}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="w-full sm:w-48"><Select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} options={STATUS_FILTER} /></div>
        <div className="w-full sm:w-48"><Input type="date" value={date} onChange={(e) => { setPage(1); setDate(e.target.value); }} /></div>
        {date && <Button variant="ghost" onClick={() => { setPage(1); setDate(''); }}>Clear</Button>}
      </div>

      <div className="card overflow-hidden">
        {loading ? <Spinner full /> : items.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No OPD visits"
            description={canEdit ? 'Start a consultation to record vitals, diagnosis and a prescription.' : 'Nothing here yet.'}
            action={canEdit ? <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> New Visit</Button> : null} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">Visit No</th>
                    <th className="px-4 py-3 font-medium">Patient</th>
                    <th className="px-4 py-3 font-medium">Doctor</th>
                    <th className="px-4 py-3 font-medium">Diagnosis</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((v) => {
                    const id = v.id || v._id;
                    const meta = OPD_STATUS_META[v.status] || { label: v.status, tone: 'neutral' };
                    return (
                      <tr key={id} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface" onClick={() => navigate(`/opd/${id}`)}>
                        <td className="px-4 py-3 font-mono text-xs">{v.visitNo}</td>
                        <td className="px-4 py-3"><div className="font-medium">{v.patient?.firstName} {v.patient?.lastName}</div><div className="font-mono text-xs text-muted">{v.patient?.uhid}</div></td>
                        <td className="px-4 py-3">Dr. {v.doctor?.firstName} {v.doctor?.lastName}</td>
                        <td className="px-4 py-3 text-muted">{v.diagnosis || <span className="italic">pending</span>}</td>
                        <td className="px-4 py-3">{formatDate(v.visitDate)}</td>
                        <td className="px-4 py-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="outline" className="h-8 !px-2" onClick={(e) => { e.stopPropagation(); navigate(`/opd/${id}`); }}>
                            <Stethoscope className="h-4 w-4" /> Open
                          </Button>
                        </td>
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

      <OpdStartForm open={formOpen} onClose={() => setFormOpen(false)} onCreated={(v) => navigate(`/opd/${v.id || v._id}`)} />
    </div>
  );
}
