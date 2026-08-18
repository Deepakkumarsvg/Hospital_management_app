import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Pill, Plus, PackagePlus, Pencil, Trash2, Search, ShoppingCart, AlertTriangle, CalendarX,
  Download, PackageOpen, SlidersHorizontal, FileDown, RotateCcw,
} from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Select from '../../components/ui/Select.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import MedicineForm from './MedicineForm.jsx';
import ReceiveBatchModal from './ReceiveBatchModal.jsx';
import AdjustStockModal from './AdjustStockModal.jsx';
import MedicineBatchesModal from './MedicineBatchesModal.jsx';
import DispenseModal from './DispenseModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  listMedicines, deleteMedicine, exportMedicines, listDispenses, exportDispenses,
  downloadDispenseReceiptPdf, returnDispense, expiringBatches, getPharmacyStats,
} from '../../services/pharmacyService.js';
import { activeDoctors } from '../../services/doctorService.js';
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
  const [adjustFor, setAdjustFor] = useState(null);
  const [viewBatchesFor, setViewBatchesFor] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [delLoading, setDelLoading] = useState(false);
  const [exporting, setExporting] = useState(null); // 'csv' | 'xlsx' | null
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
  const onExport = async (format) => {
    setExporting(format);
    try { await exportMedicines({ search, lowStock: lowOnly === 'LOW' ? 'true' : undefined }, format); }
    catch (err) { toast.error(err.message || 'Export failed'); } finally { setExporting(null); }
  };

  const { items, pagination } = data;
  // Group the current page by category for easier scanning — pagination
  // stays server-side (the catalogue can be large), so groups are per-page.
  const groups = items.reduce((acc, m) => {
    const key = m.category || 'General';
    (acc[key] ||= []).push(m);
    return acc;
  }, {});

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
        <Button variant="outline" loading={exporting === 'csv'} disabled={!!exporting} onClick={() => onExport('csv')}><Download className="h-4 w-4" /> CSV</Button>
        <Button variant="outline" loading={exporting === 'xlsx'} disabled={!!exporting} onClick={() => onExport('xlsx')}><Download className="h-4 w-4" /> Excel</Button>
        <Button variant="outline" onClick={onDispense}><ShoppingCart className="h-4 w-4" /> Dispense</Button>
        {canManage && <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> New Medicine</Button>}
      </div>

      {loading ? <ListSkeleton /> : items.length === 0 ? (
        <div className="card overflow-hidden"><EmptyState icon={Pill} title={search ? 'No medicines match your search' : 'No medicines'} description={canManage ? 'Add a medicine to the catalogue.' : 'Nothing here yet.'} /></div>
      ) : (
        <>
          {Object.entries(groups).map(([category, catItems]) => (
            <div key={category}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{category} <span className="font-normal">({catItems.length})</span></h3>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-sm">
                    <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Stock</th><th className="px-4 py-3 font-medium">Min</th>
                      <th className="px-4 py-3 font-medium">MRP</th><th className="px-4 py-3 font-medium">Selling</th>
                      <th className="px-4 py-3 text-right font-medium">Actions</th>
                    </tr></thead>
                    <tbody>
                      {catItems.map((m) => {
                        const low = m.currentStock <= m.minStock;
                        return (
                          <tr key={m.id || m._id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                            <td className="px-4 py-3"><div className="font-medium">{m.name}</div><div className="text-xs text-muted">{m.genericName}</div></td>
                            <td className="px-4 py-3"><span className={'font-semibold tabular-nums ' + (low ? 'text-red-500' : '')}>{m.currentStock}</span> <span className="text-xs text-muted">{m.unit.toLowerCase()}</span>{low && <Badge tone="danger" className="ml-2">Low</Badge>}</td>
                            <td className="px-4 py-3 tabular-nums text-muted">{m.minStock}</td>
                            <td className="px-4 py-3 tabular-nums">₹{m.mrp}</td>
                            <td className="px-4 py-3 tabular-nums">₹{m.sellingPrice}</td>
                            <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">
                              <button onClick={() => setViewBatchesFor(m)} className="btn-ghost h-8 !px-2 text-xs" title="View batches"><PackageOpen className="h-4 w-4" /> Batches</button>
                              {canManage && (
                                <>
                                  <button onClick={() => setBatchFor(m)} className="btn-ghost h-8 !px-2 text-xs" title="Receive stock"><PackagePlus className="h-4 w-4" /> Stock</button>
                                  <button onClick={() => setAdjustFor(m)} className="btn-ghost h-8 w-8 !p-0" title="Adjust stock"><SlidersHorizontal className="h-4 w-4" /></button>
                                  <button onClick={() => { setEditing(m); setFormOpen(true); }} className="btn-ghost h-8 w-8 !p-0"><Pencil className="h-4 w-4" /></button>
                                  <button onClick={() => setDeleting(m)} className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                                </>
                              )}
                            </div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
          <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} limit={pagination.limit} onChange={setPage} />
        </>
      )}
      <MedicineForm open={formOpen} onClose={() => setFormOpen(false)} medicine={editing} onSaved={fetchData} />
      <ReceiveBatchModal medicine={batchFor} onClose={() => setBatchFor(null)} onSaved={fetchData} />
      <AdjustStockModal medicine={adjustFor} onClose={() => setAdjustFor(null)} onSaved={fetchData} />
      <MedicineBatchesModal medicine={viewBatchesFor} onClose={() => setViewBatchesFor(null)} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} loading={delLoading}
        title="Delete medicine?" message={deleting ? `Delete ${deleting.name}? All batches will be removed.` : ''} confirmLabel="Delete" />
    </div>
  );
}

function Dispenses({ canManage }) {
  const toast = useToast();
  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 20 } });
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [doctor, setDoctor] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(null);
  const [returning, setReturning] = useState(null);
  const [retLoading, setRetLoading] = useState(false);
  const debounceRef = useRef();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try { setData(await listDispenses({ page, limit: 20, search, doctor: doctor || undefined })); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setLoading(false); }
  }, [page, search, doctor, toast]);
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { activeDoctors().then(setDoctors).catch(() => setDoctors([])); }, []);

  const onSearch = (e) => { const v = e.target.value; clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => { setPage(1); setSearch(v); }, 350); };
  const onExport = async (format) => {
    setExporting(format);
    try { await exportDispenses({ search, doctor: doctor || undefined }, format); }
    catch (err) { toast.error(err.message || 'Export failed'); } finally { setExporting(null); }
  };
  const confirmReturn = async () => {
    setRetLoading(true);
    try { await returnDispense(returning.id || returning._id); toast.success('Dispense returned, stock restored'); setReturning(null); fetchData(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setRetLoading(false); }
  };

  const doctorOptions = [{ value: '', label: 'All doctors' }, ...doctors.map((d) => ({ value: d.id || d._id, label: d.fullName }))];
  const { items, pagination } = data;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input pl-9" placeholder="Search by patient, doctor or dispense no…" onChange={onSearch} defaultValue={search} />
          </div>
          <div className="w-full sm:w-48"><Select value={doctor} onChange={(e) => { setPage(1); setDoctor(e.target.value); }} options={doctorOptions} /></div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" loading={exporting === 'csv'} disabled={!!exporting} onClick={() => onExport('csv')}><Download className="h-4 w-4" /> CSV</Button>
          <Button variant="outline" loading={exporting === 'xlsx'} disabled={!!exporting} onClick={() => onExport('xlsx')}><Download className="h-4 w-4" /> Excel</Button>
        </div>
      </div>
      <div className="card overflow-hidden">
        {loading ? <ListSkeleton /> : items.length === 0 ? (
          <EmptyState icon={ShoppingCart} title={search || doctor ? 'No dispenses match your filters' : 'No dispenses yet'} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">Dispense No</th><th className="px-4 py-3 font-medium">Patient</th>
                  <th className="px-4 py-3 font-medium">Items</th><th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">By</th><th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
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
                      <td className="px-4 py-3">{d.status === 'RETURNED' ? <Badge tone="neutral">Returned</Badge> : <Badge tone="success">Completed</Badge>}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => downloadDispenseReceiptPdf(d.id || d._id, d.dispenseNo).catch((e) => toast.error(e.message || 'PDF failed'))}
                            className="btn-ghost h-8 w-8 !p-0" title="Download receipt"><FileDown className="h-4 w-4" /></button>
                          {canManage && d.status !== 'RETURNED' && (
                            <button onClick={() => setReturning(d)} className="btn-ghost h-8 !px-2 text-xs" title="Return medicines"><RotateCcw className="h-4 w-4" /> Return</button>
                          )}
                        </div>
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
      <ConfirmDialog open={!!returning} onClose={() => setReturning(null)} onConfirm={confirmReturn} loading={retLoading}
        title="Return dispense?" message={returning ? `Restore stock from ${returning.dispenseNo}? This cannot be undone.` : ''} confirmLabel="Return" />
    </div>
  );
}

const EXPIRY_WINDOWS = [
  { value: '30', label: 'Next 30 days' },
  { value: '60', label: 'Next 60 days' },
  { value: '90', label: 'Next 90 days' },
  { value: '180', label: 'Next 180 days' },
];

function Expiring() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [days, setDays] = useState('90');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    expiringBatches(Number(days)).then(setItems).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, [days, toast]);

  return (
    <div className="space-y-4">
      <div className="w-full sm:w-48"><Select value={days} onChange={(e) => setDays(e.target.value)} options={EXPIRY_WINDOWS} /></div>
      {loading ? <ListSkeleton /> : items.length === 0 ? (
        <EmptyState icon={CalendarX} title="Nothing expiring" description={`No batches expiring in the next ${days} days.`} />
      ) : (
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
      )}
    </div>
  );
}

export default function Pharmacy() {
  const { role } = useAuth();
  const canManage = CAN_PHARMACY_MANAGE.includes(role);
  const [tab, setTab] = useState('Medicines');
  const [stats, setStats] = useState(null);
  const [dispOpen, setDispOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadStats = useCallback(() => { getPharmacyStats().then(setStats).catch(() => {}); }, []);
  useEffect(() => { loadStats(); }, [loadStats, refreshKey]);

  return (
    <div className="space-y-5">
      <div className="card p-5">
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
      {tab === 'Dispenses' && <Dispenses key={refreshKey} canManage={canManage} />}
      {tab === 'Expiring' && <Expiring key={refreshKey} />}

      <DispenseModal open={dispOpen} onClose={() => setDispOpen(false)} onDone={() => { setRefreshKey((k) => k + 1); loadStats(); }} />
    </div>
  );
}
