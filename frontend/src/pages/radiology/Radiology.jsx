import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scan, Plus } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Select from '../../components/ui/Select.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import NewRadOrder from './NewRadOrder.jsx';
import RadTestMaster from './RadTestMaster.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listRadOrders } from '../../services/radiologyService.js';
import { CAN_RAD_ORDER, CAN_MANAGE_ADMIN, RAD_STATUS_META, formatDate } from '../../utils/constants.js';

const STATUS_FILTER = [{ value: 'ALL', label: 'All status' },
  ...Object.entries(RAD_STATUS_META).map(([value, m]) => ({ value, label: m.label }))];

function Orders() {
  const { role } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const canOrder = CAN_RAD_ORDER.includes(role);
  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 20 } });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try { setData(await listRadOrders({ page, limit: 20, status })); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setLoading(false); }
  }, [page, status, toast]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const { items, pagination } = data;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:w-48"><Select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} options={STATUS_FILTER} /></div>
        {canOrder && <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> New Order</Button>}
      </div>
      <div className="card overflow-hidden">
        {loading ? <Spinner full /> : items.length === 0 ? (
          <EmptyState icon={Scan} title="No radiology orders" description={canOrder ? 'Order an investigation for a patient.' : 'Nothing here yet.'}
            action={canOrder ? <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> New Order</Button> : null} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">Order No</th><th className="px-4 py-3 font-medium">Patient</th>
                  <th className="px-4 py-3 font-medium">Investigation</th><th className="px-4 py-3 font-medium">Modality</th>
                  <th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Status</th>
                </tr></thead>
                <tbody>
                  {items.map((o) => {
                    const meta = RAD_STATUS_META[o.status] || { label: o.status, tone: 'neutral' };
                    return (
                      <tr key={o.id || o._id} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface" onClick={() => navigate(`/radiology/${o.id || o._id}`)}>
                        <td className="px-4 py-3 font-mono text-xs">{o.orderNo}</td>
                        <td className="px-4 py-3"><div className="font-medium">{o.patient?.firstName} {o.patient?.lastName}</div><div className="font-mono text-xs text-muted">{o.patient?.uhid}</div></td>
                        <td className="px-4 py-3">{o.testName}</td>
                        <td className="px-4 py-3"><Badge tone="neutral">{o.modality}</Badge></td>
                        <td className="px-4 py-3">{formatDate(o.createdAt)}</td>
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
      <NewRadOrder open={formOpen} onClose={() => setFormOpen(false)} onCreated={(o) => navigate(`/radiology/${o.id || o._id}`)} />
    </div>
  );
}

export default function Radiology() {
  const { role } = useAuth();
  const [tab, setTab] = useState('Orders');
  const tabs = CAN_MANAGE_ADMIN.includes(role) ? ['Orders', 'Test Master'] : ['Orders'];
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Radiology</h1>
        <p className="mt-0.5 text-sm text-muted">Imaging orders, reporting workflow and the test catalogue.</p>
      </div>
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={'rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ' + (tab === t ? 'border-b-2 border-fg text-fg' : 'text-muted hover:text-fg')}>{t}</button>
        ))}
      </div>
      {tab === 'Orders' ? <Orders /> : <RadTestMaster />}
    </div>
  );
}
