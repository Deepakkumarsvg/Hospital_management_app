import { useEffect, useState, useCallback, useRef } from 'react';
import { ScrollText, Search } from 'lucide-react';
import Badge from '../../components/ui/Badge.jsx';
import Select from '../../components/ui/Select.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listAuditLogs } from '../../services/auditService.js';
import { formatDateTime } from '../../utils/constants.js';

const ACTIONS = ['ALL', 'LOGIN', 'CREATE', 'UPDATE', 'DELETE', 'PAYMENT'];
const MODULES = ['ALL', 'Auth', 'Patient', 'Invoice', 'Payment'];
const ACTION_TONE = { LOGIN: 'neutral', CREATE: 'success', UPDATE: 'warning', DELETE: 'danger', PAYMENT: 'success' };

export default function AuditLogs() {
  const toast = useToast();
  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 30 } });
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('ALL');
  const [module, setModule] = useState('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounceRef = useRef();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try { setData(await listAuditLogs({ page, limit: 30, action, module, search })); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setLoading(false); }
  }, [page, action, module, search, toast]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const onSearch = (e) => { const v = e.target.value; clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => { setPage(1); setSearch(v); }, 350); };
  const { items, pagination } = data;

  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-semibold">Audit Logs</h1><p className="mt-0.5 text-sm text-muted">{pagination.total} recorded actions</p></div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input className="input pl-9" placeholder="Search by user, description, record…" onChange={onSearch} /></div>
        <div className="w-full sm:w-40"><Select value={action} onChange={(e) => { setPage(1); setAction(e.target.value); }} options={ACTIONS.map((a) => ({ value: a, label: a === 'ALL' ? 'All actions' : a }))} /></div>
        <div className="w-full sm:w-40"><Select value={module} onChange={(e) => { setPage(1); setModule(e.target.value); }} options={MODULES.map((m) => ({ value: m, label: m === 'ALL' ? 'All modules' : m }))} /></div>
      </div>
      <div className="card overflow-hidden">
        {loading ? <Spinner full /> : items.length === 0 ? <EmptyState icon={ScrollText} title="No logs" /> : (
          <>
            <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted"><th className="px-4 py-3 font-medium">Time</th><th className="px-4 py-3 font-medium">User</th><th className="px-4 py-3 font-medium">Action</th><th className="px-4 py-3 font-medium">Module</th><th className="px-4 py-3 font-medium">Description</th><th className="px-4 py-3 font-medium">IP</th></tr></thead>
              <tbody>{items.map((l) => (<tr key={l.id || l._id} className="border-b border-border/60 last:border-0 hover:bg-surface"><td className="px-4 py-3 whitespace-nowrap text-muted">{formatDateTime(l.createdAt)}</td><td className="px-4 py-3">{l.userName || '—'}</td><td className="px-4 py-3"><Badge tone={ACTION_TONE[l.action] || 'neutral'}>{l.action}</Badge></td><td className="px-4 py-3">{l.module}</td><td className="px-4 py-3 text-muted">{l.description}</td><td className="px-4 py-3 font-mono text-xs text-muted">{l.ip || '—'}</td></tr>))}</tbody>
            </table></div>
            <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} limit={pagination.limit} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
