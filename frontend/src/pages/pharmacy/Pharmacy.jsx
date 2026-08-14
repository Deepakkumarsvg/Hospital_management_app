import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Pill, Plus, PackagePlus, Pencil, Trash2, Search, ShoppingCart, AlertTriangle, CalendarX,
} from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Select from '../../components/ui/Select.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import MedicineForm from './MedicineForm.jsx';
import ReceiveBatchModal from './ReceiveBatchModal.jsx';
import DispenseModal from './DispenseModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  listMedicines, deleteMedicine, listDispenses, expiringBatches, getPharmacyStats,
} from '../../services/pharmacyService.js';
import { CAN_PHARMACY_MANAGE, formatDate, formatDateTime } from '../../utils/constants.js';

function Stat({ label, value, icon: Icon, tone }) {
  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between"><p className="text-xs text-muted">{label}</p><Icon className="h-4 w-4 text-muted" /></div>
      <p className={'mt-1 text-2xl font-semibold ' + (tone || '')}>{value}</p>
    </Card>
  );
}

function Medicines({ canManage, onDispense }) {
  const toast = useToast();
  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 20 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState('ALL');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [batchFor, setBatchFor] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [delLoading, setDelLoading] = useState(false);
  const debounceRef = useRef();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try { setData(await listMedicines({ page, limit: 20, search, lowStock: lowOnly === 'LOW' ? 'true' : undefined })); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setLoading(false); }
  }, [page, search, lowOnly, toast]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const onSearch = (e) => { const v = e.target.value; clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => { setPage(1); setSearch(v); }, 350); };
  const confirmDelete = async () => {
    setDelLoading(true);
    try { await deleteMedicine(deleting.id || deleting._id); toast.success('Deleted'); setDeleting(null); fetchData(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setDelLoading(false); }
  };

  const { items, pagination } = data;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search medicines…" onChange={onSearch} defaultValue={search} />
        </div>
        <div className="w-full sm:w-40">
          <Select value={lowOnly} onChange={(e) => { setPage(1); setLowOnly(e.target.value); }} options={[{ value: 'ALL', label: 'All stock' }, { value: 'LOW', label: 'Low stock only' }]} />
        </div>
        <Button variant="outline" onClick={onDispense}><ShoppingCart className="h-4 w-4" /> Dispense</Button>
        {canManage && <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> New Medicine</Button>}
      </div>

      <div className="card overflow-hidden">
        {loading ? <Spinner full /> : items.length === 0 ? (
          <EmptyState icon={Pill} title="No medicines" description={canManage ? 'Add a medicine to the catalogue.' : 'Nothing here yet.'} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Stock</th><th className="px-4 py-3 font-medium">Min</th>
                  <th className="px-4 py-3 font-medium">MRP</th><th className="px-4 py-3 font-medium">Selling</th>
                  {canManage && <th className="px-4 py-3 text-right font-medium">Actions</th>}
                </tr></thead>
                <tbody>
                  {items.map((m) => {
                    const low = m.currentStock <= m.minStock;
                    return (
                      <tr key={m.id || m._id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                        <td className="px-4 py-3"><div className="font-medium">{m.name}</div><div className="text-xs text-muted">{m.genericName}</div></td>
                        <td className="px-4 py-3 text-muted">{m.category}</td>
                        <td className="px-4 py-3"><span className={'font-semibold tabular-nums ' + (low ? 'text-red-500' : '')}>{m.currentStock}</span> <span className="text-xs text-muted">{m.unit.toLowerCase()}</span>{low && <Badge tone="danger" className="ml-2">Low</Badge>}</td>
                        <td className="px-4 py-3 tabular-nums text-muted">{m.minStock}</td>
                        <td className="px-4 py-3 tabular-nums">₹{m.mrp}</td>
                        <td className="px-4 py-3 tabular-nums">₹{m.sellingPrice}</td>
                        {canManage && (
                          <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">
                            <button onClick={() => setBatchFor(m)} className="btn-ghost h-8 !px-2 text-xs" title="Receive stock"><PackagePlus className="h-4 w-4" /> Stock</button>
                            <button onClick={() => { setEditing(m); setFormOpen(true); }} className="btn-ghost h-8 w-8 !p-0"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => setDeleting(m)} className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                          </div></td>
                        )}
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
      <MedicineForm open={formOpen} onClose={() => setFormOpen(false)} medicine={editing} onSaved={fetchData} />
      <ReceiveBatchModal medicine={batchFor} onClose={() => setBatchFor(null)} onSaved={fetchData} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} loading={delLoading}
        title="Delete medicine?" message={deleting ? `Delete ${deleting.name}? All batches will be removed.` : ''} confirmLabel="Delete" />
    </div>
  );
}

function Dispenses() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { listDispenses({ limit: 50 }).then((r) => setItems(r.items)).catch((e) => toast.error(e.message)).finally(() => setLoading(false)); }, [toast]);
  if (loading) return <Spinner full />;
  if (items.length === 0) return <EmptyState icon={ShoppingCart} title="No dispenses yet" />;
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3 font-medium">Dispense No</th><th className="px-4 py-3 font-medium">Patient</th>
            <th className="px-4 py-3 font-medium">Items</th><th className="px-4 py-3 font-medium">Total</th>
            <th className="px-4 py-3 font-medium">By</th><th className="px-4 py-3 font-medium">Date</th>
          </tr></thead>
          <tbody>
            {items.map((d) => (
              <tr key={d.id || d._id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                <td className="px-4 py-3 font-mono text-xs">{d.dispenseNo}</td>
                <td className="px-4 py-3">{d.patient ? `${d.patient.firstName} ${d.patient.lastName}` : 'Walk-in'}</td>
                <td className="px-4 py-3 text-muted">{d.items?.map((i) => `${i.name} ×${i.quantity}`).join(', ')}</td>
                <td className="px-4 py-3 tabular-nums">₹{d.total}</td>
                <td className="px-4 py-3 text-muted">{d.dispensedBy?.name || '—'}</td>
                <td className="px-4 py-3">{formatDateTime(d.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Expiring() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { expiringBatches(90).then(setItems).catch((e) => toast.error(e.message)).finally(() => setLoading(false)); }, [toast]);
  if (loading) return <Spinner full />;
  if (items.length === 0) return <EmptyState icon={CalendarX} title="Nothing expiring" description="No batches expiring in the next 90 days." />;
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3 font-medium">Medicine</th><th className="px-4 py-3 font-medium">Batch</th>
            <th className="px-4 py-3 font-medium">Qty</th><th className="px-4 py-3 font-medium">Expiry</th>
          </tr></thead>
          <tbody>
            {items.map((b) => {
              const expired = new Date(b.expiryDate) < new Date();
              return (
                <tr key={b.id || b._id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                  <td className="px-4 py-3 font-medium">{b.medicine?.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{b.batchNo}</td>
                  <td className="px-4 py-3 tabular-nums">{b.quantity}</td>
                  <td className="px-4 py-3">{formatDate(b.expiryDate)} {expired ? <Badge tone="danger" className="ml-1">Expired</Badge> : <Badge tone="warning" className="ml-1">Soon</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Pharmacy() {
  const { role } = useAuth();
  const toast = useToast();
  const canManage = CAN_PHARMACY_MANAGE.includes(role);
  const [tab, setTab] = useState('Medicines');
  const [stats, setStats] = useState(null);
  const [dispOpen, setDispOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadStats = useCallback(() => { getPharmacyStats().then(setStats).catch(() => {}); }, []);
  useEffect(() => { loadStats(); }, [loadStats, refreshKey]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Pharmacy</h1>
        <p className="mt-0.5 text-sm text-muted">Medicine catalogue, stock, dispensing and expiry alerts.</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Active Medicines" value={stats.totalMeds} icon={Pill} />
          <Stat label="Low Stock" value={stats.lowStock} icon={AlertTriangle} tone={stats.lowStock ? 'text-red-500' : ''} />
          <Stat label="Expiring (90d)" value={stats.expiringSoon} icon={CalendarX} tone={stats.expiringSoon ? 'text-amber-500' : ''} />
          <Stat label="Expired" value={stats.expired} icon={CalendarX} tone={stats.expired ? 'text-red-500' : ''} />
        </div>
      )}

      <div className="flex gap-1 border-b border-border">
        {['Medicines', 'Dispenses', 'Expiring'].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={'rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ' + (tab === t ? 'border-b-2 border-fg text-fg' : 'text-muted hover:text-fg')}>{t}</button>
        ))}
      </div>

      {tab === 'Medicines' && <Medicines key={refreshKey} canManage={canManage} onDispense={() => setDispOpen(true)} />}
      {tab === 'Dispenses' && <Dispenses key={refreshKey} />}
      {tab === 'Expiring' && <Expiring key={refreshKey} />}

      <DispenseModal open={dispOpen} onClose={() => setDispOpen(false)} onDone={() => { setRefreshKey((k) => k + 1); loadStats(); }} />
    </div>
  );
}
