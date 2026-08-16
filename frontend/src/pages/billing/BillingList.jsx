import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Receipt, Plus, IndianRupee, Wallet, AlertCircle, X, Search, Download } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Select from '../../components/ui/Select.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import NewInvoice from './NewInvoice.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listInvoices, getBillingStats } from '../../services/billingService.js';
import { CAN_BILLING, INVOICE_STATUS_META, money, formatDate } from '../../utils/constants.js';

const STATUS_FILTER = [{ value: 'ALL', label: 'All status' },
  ...Object.entries(INVOICE_STATUS_META).map(([value, m]) => ({ value, label: m.label }))];

function toCsv(rows, headers) {
  const lines = [headers.map((h) => h.label).join(',')];
  for (const row of rows) lines.push(headers.map((h) => `"${String(h.value(row) ?? '').replace(/"/g, '""')}"`).join(','));
  return lines.join('\n');
}
function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function Stat({ label, value, icon: Icon, tone }) {
  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between"><p className="text-xs text-muted">{label}</p><Icon className="h-4 w-4 text-muted" /></div>
      <p className={'mt-1 text-2xl font-semibold ' + (tone || '')}>{value}</p>
    </Card>
  );
}

export default function BillingList() {
  const { role } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const canManage = CAN_BILLING.includes(role);

  const [searchParams, setSearchParams] = useSearchParams();
  const patientFilter = searchParams.get('patient') || '';

  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 20 } });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const debounceRef = useRef();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [res] = await Promise.all([listInvoices({ page, limit: 20, status, search: search || undefined, patient: patientFilter || undefined })]);
      setData(res);
      getBillingStats().then(setStats).catch(() => {});
    } catch (err) { toast.error(err.message || 'Failed'); } finally { setLoading(false); }
  }, [page, status, search, patientFilter, toast]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const onSearchChange = (e) => {
    const v = e.target.value;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); setSearch(v); }, 350);
  };

  const clearPatientFilter = () => {
    setPage(1);
    const next = new URLSearchParams(searchParams);
    next.delete('patient');
    setSearchParams(next);
  };

  const { items, pagination } = data;

  const exportCsv = () => downloadCsv('invoices.csv', toCsv(items, [
    { label: 'Invoice No', value: (inv) => inv.invoiceNo },
    { label: 'Patient', value: (inv) => `${inv.patient?.firstName || ''} ${inv.patient?.lastName || ''}`.trim() },
    { label: 'UHID', value: (inv) => inv.patient?.uhid || '' },
    { label: 'Total', value: (inv) => inv.grandTotal },
    { label: 'Paid', value: (inv) => inv.paidAmount },
    { label: 'Due', value: (inv) => inv.dueAmount },
    { label: 'Status', value: (inv) => inv.status },
    { label: 'Date', value: (inv) => formatDate(inv.createdAt) },
  ]));
  return (
    <div className="space-y-5">
      <div className="card flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Billing</h1>
          <p className="mt-0.5 text-sm text-muted">{pagination.total} invoice{pagination.total === 1 ? '' : 's'}</p>
        </div>
        {canManage && <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> New Invoice</Button>}
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Total Billed" value={money(stats.billed)} icon={Receipt} />
          <Stat label="Collected" value={money(stats.collected)} icon={Wallet} tone="text-green-600 dark:text-green-400" />
          <Stat label="Outstanding" value={money(stats.due)} icon={IndianRupee} tone={stats.due ? 'text-red-500' : ''} />
          <Stat label="Pending Invoices" value={stats.pendingInvoices} icon={AlertCircle} />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search invoice no. or patient…" onChange={onSearchChange} defaultValue={search} />
        </div>
        <div className="w-full sm:w-48"><Select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} options={STATUS_FILTER} /></div>
        {patientFilter && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm">
            Filtered to one patient
            <button onClick={clearPatientFilter} className="text-muted hover:text-fg" aria-label="Clear patient filter">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
        {items.length > 0 && <Button variant="outline" className="sm:ml-auto" onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button>}
      </div>

      <div className="card overflow-hidden">
        {loading ? <Spinner full /> : items.length === 0 ? (
          <EmptyState icon={Receipt} title="No invoices" description={canManage ? 'Create an invoice for a patient.' : 'Nothing here yet.'}
            action={canManage ? <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> New Invoice</Button> : null} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">Invoice No</th><th className="px-4 py-3 font-medium">Patient</th>
                  <th className="px-4 py-3 font-medium">Total</th><th className="px-4 py-3 font-medium">Paid</th>
                  <th className="px-4 py-3 font-medium">Due</th><th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr></thead>
                <tbody>
                  {items.map((inv) => {
                    const meta = INVOICE_STATUS_META[inv.status] || { label: inv.status, tone: 'neutral' };
                    return (
                      <tr key={inv.id || inv._id} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface" onClick={() => navigate(`/billing/${inv.id || inv._id}`)}>
                        <td className="px-4 py-3 font-mono text-xs">{inv.invoiceNo}</td>
                        <td className="px-4 py-3"><div className="font-medium">{inv.patient?.firstName} {inv.patient?.lastName}</div><div className="font-mono text-xs text-muted">{inv.patient?.uhid}</div></td>
                        <td className="px-4 py-3 tabular-nums">{money(inv.grandTotal)}</td>
                        <td className="px-4 py-3 tabular-nums text-green-600 dark:text-green-400">{money(inv.paidAmount)}</td>
                        <td className="px-4 py-3 tabular-nums">{inv.dueAmount > 0 ? <span className="text-red-500">{money(inv.dueAmount)}</span> : money(0)}</td>
                        <td className="px-4 py-3">{formatDate(inv.createdAt)}</td>
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

      <NewInvoice open={formOpen} onClose={() => setFormOpen(false)} onCreated={(inv) => navigate(`/billing/${inv.id || inv._id}`)} />
    </div>
  );
}
