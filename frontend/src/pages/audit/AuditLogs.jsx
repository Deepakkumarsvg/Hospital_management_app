import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ScrollText, Search, Download, Eye } from 'lucide-react';
import Badge from '../../components/ui/Badge.jsx';
import Select from '../../components/ui/Select.jsx';
import Input from '../../components/ui/Input.jsx';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listAuditLogs, getAuditFacets, exportAuditLogs } from '../../services/auditService.js';
import { formatDateTime } from '../../utils/constants.js';

const ACTION_TONE = { LOGIN: 'neutral', CREATE: 'success', UPDATE: 'warning', ADJUST: 'warning', DELETE: 'danger', PAYMENT: 'success' };

const RANGE_PRESETS = [
  { key: 'today', label: 'Today', days: 0 },
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: 'all', label: 'All time', all: true },
];
function toISODate(d) { return d.toISOString().slice(0, 10); }
function computePreset(preset) {
  if (preset.all) return { from: '', to: '' };
  const now = new Date();
  const from = new Date(now); from.setDate(from.getDate() - preset.days);
  return { from: toISODate(from), to: toISODate(now) };
}

function DetailModal({ log, onClose }) {
  return (
    <Modal open={!!log} onClose={onClose} size="lg" title={log ? `${log.module} · ${log.action}` : ''}>
      {log && (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-xs text-muted">Time</p><p className="mt-0.5">{formatDateTime(log.createdAt)}</p></div>
            <div><p className="text-xs text-muted">User</p><p className="mt-0.5">{log.userName || '—'}</p></div>
            <div><p className="text-xs text-muted">Record ID</p><p className="mt-0.5 font-mono text-xs">{log.recordId || '—'}</p></div>
            <div><p className="text-xs text-muted">IP</p><p className="mt-0.5 font-mono text-xs">{log.ip || '—'}</p></div>
          </div>
          <div><p className="text-xs text-muted">Description</p><p className="mt-0.5">{log.description || '—'}</p></div>
          {log.meta != null && (
            <div>
              <p className="mb-1 text-xs text-muted">Details</p>
              <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-surface p-3 text-xs">{JSON.stringify(log.meta, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function AuditLogs() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 30 } });
  const [facets, setFacets] = useState({ modules: [], actions: [] });
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('ALL');
  const [module, setModule] = useState('ALL');
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [activePreset, setActivePreset] = useState('all');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(null);
  const [viewing, setViewing] = useState(null);
  const debounceRef = useRef();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try { setData(await listAuditLogs({ page, limit: 30, action, module, search, from: from || undefined, to: to || undefined })); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setLoading(false); }
  }, [page, action, module, search, from, to, toast]);
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { getAuditFacets().then(setFacets).catch(() => {}); }, []);

  const onSearch = (e) => { const v = e.target.value; clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => { setPage(1); setSearch(v); }, 350); };
  const applyPreset = (preset) => {
    setActivePreset(preset.key);
    const { from: f, to: t } = computePreset(preset);
    setFrom(f); setTo(t); setPage(1);
  };
  const onExport = async (format) => {
    setExporting(format);
    try { await exportAuditLogs({ search, module, action, from: from || undefined, to: to || undefined }, format); }
    catch (err) { toast.error(err.message || 'Export failed'); } finally { setExporting(null); }
  };

  const actionOptions = ['ALL', ...facets.actions].map((a) => ({ value: a, label: a === 'ALL' ? 'All actions' : a }));
  const moduleOptions = ['ALL', ...facets.modules].map((m) => ({ value: m, label: m === 'ALL' ? 'All modules' : m }));
  const { items, pagination } = data;

  return (
    <div className="space-y-5">
      <div className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Audit Logs</h1>
          <p className="mt-0.5 text-sm text-muted">{pagination.total} recorded actions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" loading={exporting === 'csv'} disabled={!!exporting} onClick={() => onExport('csv')}><Download className="h-4 w-4" /> CSV</Button>
          <Button variant="outline" loading={exporting === 'xlsx'} disabled={!!exporting} onClick={() => onExport('xlsx')}><Download className="h-4 w-4" /> Excel</Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input pl-9" placeholder="Search by user, description, record…" onChange={onSearch} defaultValue={search} />
          </div>
          <div className="w-full sm:w-40"><Select value={action} onChange={(e) => { setPage(1); setAction(e.target.value); }} options={actionOptions} /></div>
          <div className="w-full sm:w-44"><Select value={module} onChange={(e) => { setPage(1); setModule(e.target.value); }} options={moduleOptions} /></div>
          <div className="w-36"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setActivePreset('custom'); setPage(1); }} /></div>
          <div className="w-36"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setActivePreset('custom'); setPage(1); }} /></div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RANGE_PRESETS.map((p) => (
            <button key={p.key} onClick={() => applyPreset(p)}
              className={'rounded-full border px-3 py-1 text-xs font-medium transition-colors ' +
                (activePreset === p.key ? 'border-accent bg-accent text-accent-fg' : 'border-border text-muted hover:text-fg hover:bg-surface')}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? <ListSkeleton /> : items.length === 0 ? <EmptyState icon={ScrollText} title="No logs" /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">Time</th>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Module</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium">IP</th>
                    <th className="px-4 py-3 text-right font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((l) => (
                    <tr key={l.id || l._id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                      <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDateTime(l.createdAt)}</td>
                      <td className="px-4 py-3">{l.userName || '—'}</td>
                      <td className="px-4 py-3"><Badge tone={ACTION_TONE[l.action] || 'neutral'}>{l.action}</Badge></td>
                      <td className="px-4 py-3">{l.module}</td>
                      <td className="px-4 py-3 text-muted">{l.description}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted">{l.ip || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setViewing(l)} className="btn-ghost h-8 w-8 !p-0" title="View details"><Eye className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} limit={pagination.limit} onChange={setPage} />
          </>
        )}
      </div>
      <DetailModal log={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
