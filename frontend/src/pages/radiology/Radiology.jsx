import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Scan, Plus, X, Search, Download, Clock, FileCheck2 } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Select from '../../components/ui/Select.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import NewRadOrder from './NewRadOrder.jsx';
import RadTestMaster from './RadTestMaster.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listRadOrders, exportRadOrders, getRadStats } from '../../services/radiologyService.js';
import { activeDoctors } from '../../services/doctorService.js';
import { CAN_RAD_ORDER, CAN_MANAGE_ADMIN, RAD_STATUS_META, formatDate } from '../../utils/constants.js';

const STATUS_FILTER = [{ value: 'ALL', label: 'All status' },
  ...Object.entries(RAD_STATUS_META).map(([value, m]) => ({ value, label: m.label }))];

function StatTile({ label, value, tone, icon: Icon }) {
  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">{label}</p>
        {Icon && <Icon className={'h-4 w-4 ' + (tone || 'text-muted')} />}
      </div>
      <p className={'mt-1 text-2xl font-semibold ' + (tone || '')}>{value}</p>
    </Card>
  );
}

function Orders() {
  const { role } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const canOrder = CAN_RAD_ORDER.includes(role);
  const [searchParams, setSearchParams] = useSearchParams();
  const patientFilter = searchParams.get('patient') || '';
  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 20 } });
  const [stats, setStats] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [doctor, setDoctor] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [exporting, setExporting] = useState(null); // 'csv' | 'xlsx' | null
  const debounceRef = useRef();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try { setData(await listRadOrders({ page, limit: 20, search, status, doctor: doctor || undefined, patient: patientFilter || undefined })); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setLoading(false); }
  }, [page, search, status, doctor, patientFilter, toast]);
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    getRadStats().then(setStats).catch(() => {});
    activeDoctors().then(setDoctors).catch(() => setDoctors([]));
  }, []);

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

  const onExport = async (format) => {
    setExporting(format);
    try { await exportRadOrders({ search, status, doctor: doctor || undefined, patient: patientFilter }, format); }
    catch (err) { toast.error(err.message || 'Export failed'); } finally { setExporting(null); }
  };

  const doctorOptions = [{ value: '', label: 'All doctors' }, ...doctors.map((d) => ({ value: d.id || d._id, label: `${d.fullName}` }))];
  const { items, pagination } = data;
  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <StatTile label="Total Orders" value={stats.total} icon={Scan} />
          <StatTile label="Pending" value={stats.pending} tone="text-amber-600 dark:text-amber-400" icon={Clock} />
          <StatTile label="Reported" value={stats.reported} tone="text-green-600 dark:text-green-400" icon={FileCheck2} />
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input pl-9" placeholder="Search by patient, doctor or order no…" onChange={onSearchChange} defaultValue={search} />
          </div>
          <div className="w-full sm:w-48"><Select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} options={STATUS_FILTER} /></div>
          <div className="w-full sm:w-48"><Select value={doctor} onChange={(e) => { setPage(1); setDoctor(e.target.value); }} options={doctorOptions} /></div>
          {patientFilter && (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm">
              Filtered to one patient
              <button onClick={clearPatientFilter} className="text-muted hover:text-fg" aria-label="Clear patient filter">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" loading={exporting === 'csv'} disabled={!!exporting} onClick={() => onExport('csv')}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" loading={exporting === 'xlsx'} disabled={!!exporting} onClick={() => onExport('xlsx')}>
            <Download className="h-4 w-4" /> Excel
          </Button>
          {canOrder && <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> New Order</Button>}
        </div>
      </div>
      <div className="card overflow-hidden">
        {loading ? <ListSkeleton /> : items.length === 0 ? (
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
      <div className="card p-5">
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
