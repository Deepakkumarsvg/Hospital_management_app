import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Boxes, Plus, Pencil, Trash2, Search, SlidersHorizontal, Truck, ClipboardList,
  AlertTriangle, PackageCheck, XCircle, Download, History, FileDown, Send, RefreshCw, Eye,
  PackageOpen, Upload,
} from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Select from '../../components/ui/Select.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { ItemForm, AdjustStockModal, VendorForm, NewPurchaseOrder, ReceivePOModal, VendorDetailModal } from './InventoryModals.jsx';
import ItemTransactionsModal from './ItemTransactionsModal.jsx';
import InventoryBatchesModal from './InventoryBatchesModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  listItems, deleteItem, exportItems, importItems, listVendors, deleteVendor, exportVendors,
  listPurchaseOrders, placeOrder, cancelPurchaseOrder, exportPurchaseOrders,
  downloadPurchaseOrderPdf, getInventoryStats, activeVendors,
} from '../../services/inventoryService.js';
import { CAN_INVENTORY_MANAGE, ITEM_CATEGORY_OPTIONS, PO_STATUS_META, formatDate } from '../../utils/constants.js';

function Stat({ label, value, icon: Icon, tone }) {
  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between"><p className="text-xs text-muted">{label}</p><Icon className="h-4 w-4 text-muted" /></div>
      <p className={'mt-1 text-2xl font-semibold ' + (tone || '')}>{value}</p>
    </Card>
  );
}

function Items({ canManage, onReorder, onViewPO }) {
  const toast = useToast();
  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 20 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [lowOnly, setLowOnly] = useState('ALL');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [adjusting, setAdjusting] = useState(null);
  const [viewingTxns, setViewingTxns] = useState(null);
  const [viewingBatches, setViewingBatches] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [delLoading, setDelLoading] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef();
  const debounceRef = useRef();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try { setData(await listItems({ page, limit: 20, search, category, lowStock: lowOnly === 'LOW' ? 'true' : undefined })); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setLoading(false); }
  }, [page, search, category, lowOnly, toast]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const onSearch = (e) => { const v = e.target.value; clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => { setPage(1); setSearch(v); }, 350); };
  const confirmDelete = async () => {
    setDelLoading(true);
    try { await deleteItem(deleting.id || deleting._id); toast.success('Deleted'); setDeleting(null); fetchData(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setDelLoading(false); }
  };
  const onExport = async (format) => {
    setExporting(format);
    try { await exportItems({ search, category, lowStock: lowOnly === 'LOW' ? 'true' : undefined }, format); }
    catch (err) { toast.error(err.message || 'Export failed'); } finally { setExporting(null); }
  };
  const onImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const r = await importItems(file);
      toast.success(`Imported · ${r.created} created, ${r.updated} updated${r.errors.length ? `, ${r.errors.length} row(s) skipped` : ''}`);
      if (r.errors.length) r.errors.slice(0, 3).forEach((msg) => toast.error(msg));
      fetchData();
    } catch (err) { toast.error(err.message || 'Import failed'); } finally { setImporting(false); }
  };

  const { items, pagination } = data;
  // Group the current page by category for easier scanning.
  const groups = items.reduce((acc, it) => {
    (acc[it.category] ||= []).push(it);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search items…" onChange={onSearch} defaultValue={search} />
        </div>
        <div className="w-full sm:w-44"><Select value={category} onChange={(e) => { setPage(1); setCategory(e.target.value); }} options={[{ value: 'ALL', label: 'All categories' }, ...ITEM_CATEGORY_OPTIONS]} /></div>
        <div className="w-full sm:w-40"><Select value={lowOnly} onChange={(e) => { setPage(1); setLowOnly(e.target.value); }} options={[{ value: 'ALL', label: 'All stock' }, { value: 'LOW', label: 'Low stock only' }]} /></div>
        <Button variant="outline" loading={exporting === 'csv'} disabled={!!exporting} onClick={() => onExport('csv')}><Download className="h-4 w-4" /> CSV</Button>
        <Button variant="outline" loading={exporting === 'xlsx'} disabled={!!exporting} onClick={() => onExport('xlsx')}><Download className="h-4 w-4" /> Excel</Button>
        {canManage && (
          <>
            <input ref={importInputRef} type="file" accept=".csv" className="hidden" onChange={onImportFile} />
            <Button variant="outline" loading={importing} disabled={importing} onClick={() => importInputRef.current?.click()}><Upload className="h-4 w-4" /> Import</Button>
            <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> New Item</Button>
          </>
        )}
      </div>
      {loading ? <Spinner full /> : items.length === 0 ? (
        <div className="card overflow-hidden"><EmptyState icon={Boxes} title={search ? 'No items match your search' : 'No items'} description={canManage ? 'Add an inventory item.' : 'Nothing here yet.'} /></div>
      ) : (
        <>
          {Object.entries(groups).map(([cat, catItems]) => (
            <div key={cat}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{cat} <span className="font-normal">({catItems.length})</span></h3>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                      <th className="px-4 py-3 font-medium">Code</th><th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Stock</th>
                      <th className="px-4 py-3 font-medium">Unit Price</th><th className="px-4 py-3 text-right font-medium">Actions</th>
                    </tr></thead>
                    <tbody>
                      {catItems.map((it) => {
                        const low = it.currentStock <= it.minStock;
                        return (
                          <tr key={it.id || it._id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                            <td className="px-4 py-3"><Badge>{it.code}</Badge></td>
                            <td className="px-4 py-3 font-medium">{it.name}</td>
                            <td className="px-4 py-3"><span className={'font-semibold tabular-nums ' + (low ? 'text-red-500' : '')}>{it.currentStock}</span> <span className="text-xs text-muted">{it.unit}</span>{low && <Badge tone="danger" className="ml-2">Low</Badge>}</td>
                            <td className="px-4 py-3 tabular-nums">₹{it.unitPrice}</td>
                            <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">
                              <button onClick={() => setViewingBatches(it)} className="btn-ghost h-8 !px-2 text-xs" title="Stock batches"><PackageOpen className="h-4 w-4" /> Batches</button>
                              <button onClick={() => setViewingTxns(it)} className="btn-ghost h-8 !px-2 text-xs" title="Stock movement history"><History className="h-4 w-4" /> History</button>
                              {canManage && low && (
                                <button onClick={() => onReorder(it)} className="btn-ghost h-8 !px-2 text-xs !text-amber-600 dark:!text-amber-400" title="Create a purchase order for this item"><RefreshCw className="h-4 w-4" /> Reorder</button>
                              )}
                              {canManage && (
                                <>
                                  <button onClick={() => setAdjusting(it)} className="btn-ghost h-8 !px-2 text-xs" title="Adjust stock"><SlidersHorizontal className="h-4 w-4" /> Stock</button>
                                  <button onClick={() => { setEditing(it); setFormOpen(true); }} className="btn-ghost h-8 w-8 !p-0"><Pencil className="h-4 w-4" /></button>
                                  <button onClick={() => setDeleting(it)} className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
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
      <ItemForm open={formOpen} onClose={() => setFormOpen(false)} item={editing} onSaved={fetchData} />
      <AdjustStockModal item={adjusting} onClose={() => setAdjusting(null)} onSaved={fetchData} />
      <ItemTransactionsModal item={viewingTxns} onClose={() => setViewingTxns(null)}
        onViewPO={(poNo) => { setViewingTxns(null); onViewPO(poNo); }} />
      <InventoryBatchesModal item={viewingBatches} onClose={() => setViewingBatches(null)} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} loading={delLoading} title="Delete item?" message={deleting ? `Delete ${deleting.name}?` : ''} confirmLabel="Delete" />
    </div>
  );
}

function Vendors({ canManage }) {
  const toast = useToast();
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [delLoading, setDelLoading] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [viewingId, setViewingId] = useState(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => { setLoading(true); try { setVendors(await listVendors()); } catch (e) { toast.error(e.message); } finally { setLoading(false); } }, [toast]);
  useEffect(() => { load(); }, [load]);
  const confirmDelete = async () => {
    setDelLoading(true);
    try { await deleteVendor(deleting.id || deleting._id); toast.success('Deleted'); setDeleting(null); load(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setDelLoading(false); }
  };
  const onExport = async (format) => {
    setExporting(format);
    try { await exportVendors(format); }
    catch (err) { toast.error(err.message || 'Export failed'); } finally { setExporting(null); }
  };
  if (loading) return <Spinner full />;

  const q = search.trim().toLowerCase();
  const filtered = q ? vendors.filter((v) => [v.name, v.code, v.contactPerson, v.phone, v.email].some((f) => f?.toLowerCase().includes(q))) : vendors;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search vendors…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" loading={exporting === 'csv'} disabled={!!exporting} onClick={() => onExport('csv')}><Download className="h-4 w-4" /> CSV</Button>
          <Button variant="outline" loading={exporting === 'xlsx'} disabled={!!exporting} onClick={() => onExport('xlsx')}><Download className="h-4 w-4" /> Excel</Button>
          {canManage && <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> New Vendor</Button>}
        </div>
      </div>
      {filtered.length === 0 ? <EmptyState icon={Truck} title={q ? 'No vendors match your search' : 'No vendors'} /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Code</th><th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Contact</th><th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr></thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id || v._id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                  <td className="px-4 py-3"><Badge>{v.code}</Badge></td>
                  <td className="px-4 py-3 font-medium">{v.name}</td>
                  <td className="px-4 py-3 text-muted">{v.contactPerson || '—'}</td>
                  <td className="px-4 py-3 tabular-nums">{v.phone || '—'}</td>
                  <td className="px-4 py-3"><Badge tone={v.status === 'ACTIVE' ? 'success' : 'neutral'}>{v.status}</Badge></td>
                  <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">
                    <button onClick={() => setViewingId(v.id || v._id)} className="btn-ghost h-8 !px-2 text-xs" title="View history"><Eye className="h-4 w-4" /> View</button>
                    {canManage && (
                      <>
                        <button onClick={() => { setEditing(v); setFormOpen(true); }} className="btn-ghost h-8 w-8 !p-0"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => setDeleting(v)} className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                      </>
                    )}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <VendorForm open={formOpen} onClose={() => setFormOpen(false)} vendor={editing} onSaved={load} />
      <VendorDetailModal vendorId={viewingId} onClose={() => setViewingId(null)} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} loading={delLoading} title="Delete vendor?" message={deleting ? `Delete ${deleting.name}?` : ''} confirmLabel="Delete" />
    </div>
  );
}

const PO_STATUS_FILTER = [{ value: 'ALL', label: 'All status' },
  ...Object.entries(PO_STATUS_META).map(([value, m]) => ({ value, label: m.label }))];

function PurchaseOrders({ canManage, initialSearch, onConsumedInitialSearch, presetItems, onConsumedPresetItems }) {
  const toast = useToast();
  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 20 } });
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialSearch || '');
  const [status, setStatus] = useState('ALL');
  const [vendor, setVendor] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(!!presetItems?.length);
  const [editingPo, setEditingPo] = useState(null);
  const [receiving, setReceiving] = useState(null);
  const [exporting, setExporting] = useState(null);
  const [busy, setBusy] = useState(null);
  const debounceRef = useRef();

  useEffect(() => {
    if (initialSearch) onConsumedInitialSearch?.();
    if (presetItems?.length) onConsumedPresetItems?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try { setData(await listPurchaseOrders({ page, limit: 20, search, status, vendor: vendor || undefined })); }
    catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, [page, search, status, vendor, toast]);
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { activeVendors().then(setVendors).catch(() => setVendors([])); }, []);

  const onSearch = (e) => { const v = e.target.value; clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => { setPage(1); setSearch(v); }, 350); };
  const onExport = async (format) => {
    setExporting(format);
    try { await exportPurchaseOrders({ search, status, vendor: vendor || undefined }, format); }
    catch (err) { toast.error(err.message || 'Export failed'); } finally { setExporting(null); }
  };
  const place = async (po) => { setBusy(po.id || po._id); try { await placeOrder(po.id || po._id); toast.success('Order placed'); fetchData(); } catch (e) { toast.error(e.message); } finally { setBusy(null); } };
  const cancel = async (po) => { setBusy(po.id || po._id); try { await cancelPurchaseOrder(po.id || po._id); toast.success('Cancelled'); fetchData(); } catch (e) { toast.error(e.message); } finally { setBusy(null); } };

  const vendorOptions = [{ value: '', label: 'All vendors' }, ...vendors.map((v) => ({ value: v.id || v._id, label: v.name }))];
  const { items, pagination } = data;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input pl-9" placeholder="Search by PO no or vendor…" onChange={onSearch} defaultValue={search} />
          </div>
          <div className="w-full sm:w-44"><Select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} options={PO_STATUS_FILTER} /></div>
          <div className="w-full sm:w-44"><Select value={vendor} onChange={(e) => { setPage(1); setVendor(e.target.value); }} options={vendorOptions} /></div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" loading={exporting === 'csv'} disabled={!!exporting} onClick={() => onExport('csv')}><Download className="h-4 w-4" /> CSV</Button>
          <Button variant="outline" loading={exporting === 'xlsx'} disabled={!!exporting} onClick={() => onExport('xlsx')}><Download className="h-4 w-4" /> Excel</Button>
          {canManage && <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> New PO</Button>}
        </div>
      </div>
      <div className="card overflow-hidden">
        {loading ? <Spinner full /> : items.length === 0 ? (
          <EmptyState icon={ClipboardList} title={search || vendor || status !== 'ALL' ? 'No purchase orders match your filters' : 'No purchase orders'} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">PO No</th><th className="px-4 py-3 font-medium">Vendor</th>
                  <th className="px-4 py-3 font-medium">Items</th><th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr></thead>
                <tbody>
                  {items.map((po) => {
                    const meta = PO_STATUS_META[po.status] || { label: po.status, tone: 'neutral' };
                    const id = po.id || po._id;
                    const orderedQty = (po.items || []).reduce((s, it) => s + it.quantity, 0);
                    const receivedQty = (po.items || []).reduce((s, it) => s + (it.receivedQuantity || 0), 0);
                    return (
                      <tr key={id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                        <td className="px-4 py-3 font-mono text-xs">{po.poNo}</td>
                        <td className="px-4 py-3">{po.vendor?.name}</td>
                        <td className="px-4 py-3 tabular-nums text-muted">{po.items?.length}</td>
                        <td className="px-4 py-3 tabular-nums">₹{po.total}</td>
                        <td className="px-4 py-3">{po.orderedAt ? formatDate(po.orderedAt) : '—'}</td>
                        <td className="px-4 py-3">
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                          {(po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED') && (
                            <span className="ml-1.5 text-xs text-muted">{receivedQty}/{orderedQty} received</span>
                          )}
                        </td>
                        <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">
                          <button onClick={() => downloadPurchaseOrderPdf(id, po.poNo).catch((e) => toast.error(e.message || 'PDF failed'))}
                            className="btn-ghost h-8 w-8 !p-0" title="Download PO"><FileDown className="h-4 w-4" /></button>
                          {canManage && po.status === 'DRAFT' && (
                            <button onClick={() => { setEditingPo(po); setFormOpen(true); }} className="btn-ghost h-8 w-8 !p-0" title="Edit draft"><Pencil className="h-4 w-4" /></button>
                          )}
                          {canManage && po.status === 'DRAFT' && (
                            <Button className="h-8 !px-2" onClick={() => place(po)} loading={busy === id}><Send className="h-4 w-4" /> Place</Button>
                          )}
                          {canManage && (po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED') && (
                            <Button className="h-8 !px-2" onClick={() => setReceiving(po)}><PackageCheck className="h-4 w-4" /> Receive</Button>
                          )}
                          {canManage && ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED'].includes(po.status) && (
                            <button onClick={() => cancel(po)} disabled={busy === id} className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10" title="Cancel"><XCircle className="h-4 w-4" /></button>
                          )}
                        </div></td>
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
      <NewPurchaseOrder open={formOpen} onClose={() => { setFormOpen(false); setEditingPo(null); }} onCreated={fetchData} po={editingPo} presetItems={presetItems} />
      <ReceivePOModal po={receiving} onClose={() => setReceiving(null)} onReceived={fetchData} />
    </div>
  );
}

export default function Inventory() {
  const { role } = useAuth();
  const canManage = CAN_INVENTORY_MANAGE.includes(role);
  const [tab, setTab] = useState('Items');
  const [stats, setStats] = useState(null);
  const [poSearchPrefill, setPoSearchPrefill] = useState('');
  const [poReorderItems, setPoReorderItems] = useState(null);
  useEffect(() => { getInventoryStats().then(setStats).catch(() => {}); }, [tab]);

  const viewPO = (poNo) => { setPoSearchPrefill(poNo); setTab('Purchase Orders'); };
  const reorder = (item) => {
    const suggested = Math.max(item.minStock * 2 - item.currentStock, item.minStock);
    setPoReorderItems([{ item: item.id || item._id, quantity: suggested }]);
    setTab('Purchase Orders');
  };

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <h1 className="text-xl font-semibold">Inventory</h1>
        <p className="mt-0.5 text-sm text-muted">Items, vendors, purchase orders and stock movements.</p>
      </div>
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Active Items" value={stats.totalItems} icon={Boxes} />
          <Stat label="Low Stock" value={stats.lowStock} icon={AlertTriangle} tone={stats.lowStock ? 'text-red-500' : ''} />
          <Stat label="Vendors" value={stats.vendors} icon={Truck} />
          <Stat label="Open POs" value={stats.openPOs} icon={ClipboardList} />
        </div>
      )}
      <div className="flex gap-1 border-b border-border">
        {['Items', 'Vendors', 'Purchase Orders'].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={'rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ' + (tab === t ? 'border-b-2 border-fg text-fg' : 'text-muted hover:text-fg')}>{t}</button>
        ))}
      </div>
      {tab === 'Items' && <Items canManage={canManage} onReorder={reorder} onViewPO={viewPO} />}
      {tab === 'Vendors' && <Vendors canManage={canManage} />}
      {tab === 'Purchase Orders' && (
        <PurchaseOrders canManage={canManage}
          initialSearch={poSearchPrefill} onConsumedInitialSearch={() => setPoSearchPrefill('')}
          presetItems={poReorderItems} onConsumedPresetItems={() => setPoReorderItems(null)} />
      )}
    </div>
  );
}
