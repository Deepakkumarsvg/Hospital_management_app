import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Boxes, Plus, Pencil, Trash2, Search, SlidersHorizontal, Truck, ClipboardList,
  AlertTriangle, PackageCheck, XCircle,
} from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Select from '../../components/ui/Select.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { ItemForm, AdjustStockModal, VendorForm, NewPurchaseOrder } from './InventoryModals.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  listItems, deleteItem, listVendors, deleteVendor,
  listPurchaseOrders, receivePurchaseOrder, cancelPurchaseOrder, getInventoryStats,
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

function Items({ canManage }) {
  const toast = useToast();
  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 20 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [adjusting, setAdjusting] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [delLoading, setDelLoading] = useState(false);
  const debounceRef = useRef();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try { setData(await listItems({ page, limit: 20, search, category })); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setLoading(false); }
  }, [page, search, category, toast]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const onSearch = (e) => { const v = e.target.value; clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => { setPage(1); setSearch(v); }, 350); };
  const confirmDelete = async () => {
    setDelLoading(true);
    try { await deleteItem(deleting.id || deleting._id); toast.success('Deleted'); setDeleting(null); fetchData(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setDelLoading(false); }
  };

  const { items, pagination } = data;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search items…" onChange={onSearch} defaultValue={search} />
        </div>
        <div className="w-full sm:w-44"><Select value={category} onChange={(e) => { setPage(1); setCategory(e.target.value); }} options={[{ value: 'ALL', label: 'All categories' }, ...ITEM_CATEGORY_OPTIONS]} /></div>
        {canManage && <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> New Item</Button>}
      </div>
      <div className="card overflow-hidden">
        {loading ? <Spinner full /> : items.length === 0 ? (
          <EmptyState icon={Boxes} title="No items" description={canManage ? 'Add an inventory item.' : 'Nothing here yet.'} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">Code</th><th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Category</th><th className="px-4 py-3 font-medium">Stock</th>
                  <th className="px-4 py-3 font-medium">Unit Price</th>{canManage && <th className="px-4 py-3 text-right font-medium">Actions</th>}
                </tr></thead>
                <tbody>
                  {items.map((it) => {
                    const low = it.currentStock <= it.minStock;
                    return (
                      <tr key={it.id || it._id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                        <td className="px-4 py-3"><Badge>{it.code}</Badge></td>
                        <td className="px-4 py-3 font-medium">{it.name}</td>
                        <td className="px-4 py-3 text-muted">{it.category}</td>
                        <td className="px-4 py-3"><span className={'font-semibold tabular-nums ' + (low ? 'text-red-500' : '')}>{it.currentStock}</span> <span className="text-xs text-muted">{it.unit}</span>{low && <Badge tone="danger" className="ml-2">Low</Badge>}</td>
                        <td className="px-4 py-3 tabular-nums">₹{it.unitPrice}</td>
                        {canManage && (
                          <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">
                            <button onClick={() => setAdjusting(it)} className="btn-ghost h-8 !px-2 text-xs" title="Adjust stock"><SlidersHorizontal className="h-4 w-4" /> Stock</button>
                            <button onClick={() => { setEditing(it); setFormOpen(true); }} className="btn-ghost h-8 w-8 !p-0"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => setDeleting(it)} className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
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
      <ItemForm open={formOpen} onClose={() => setFormOpen(false)} item={editing} onSaved={fetchData} />
      <AdjustStockModal item={adjusting} onClose={() => setAdjusting(null)} onSaved={fetchData} />
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

  const load = useCallback(async () => { setLoading(true); try { setVendors(await listVendors()); } catch (e) { toast.error(e.message); } finally { setLoading(false); } }, [toast]);
  useEffect(() => { load(); }, [load]);
  const confirmDelete = async () => {
    setDelLoading(true);
    try { await deleteVendor(deleting.id || deleting._id); toast.success('Deleted'); setDeleting(null); load(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setDelLoading(false); }
  };
  if (loading) return <Spinner full />;
  return (
    <div className="space-y-4">
      {canManage && <div className="flex justify-end"><Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> New Vendor</Button></div>}
      {vendors.length === 0 ? <EmptyState icon={Truck} title="No vendors" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Code</th><th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Contact</th><th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Status</th>{canManage && <th className="px-4 py-3 text-right font-medium">Actions</th>}
            </tr></thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id || v._id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                  <td className="px-4 py-3"><Badge>{v.code}</Badge></td>
                  <td className="px-4 py-3 font-medium">{v.name}</td>
                  <td className="px-4 py-3 text-muted">{v.contactPerson || '—'}</td>
                  <td className="px-4 py-3 tabular-nums">{v.phone || '—'}</td>
                  <td className="px-4 py-3"><Badge tone={v.status === 'ACTIVE' ? 'success' : 'neutral'}>{v.status}</Badge></td>
                  {canManage && (
                    <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setEditing(v); setFormOpen(true); }} className="btn-ghost h-8 w-8 !p-0"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => setDeleting(v)} className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                    </div></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <VendorForm open={formOpen} onClose={() => setFormOpen(false)} vendor={editing} onSaved={load} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} loading={delLoading} title="Delete vendor?" message={deleting ? `Delete ${deleting.name}?` : ''} confirmLabel="Delete" />
    </div>
  );
}

function PurchaseOrders({ canManage }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => { setLoading(true); try { setItems((await listPurchaseOrders({ limit: 50 })).items); } catch (e) { toast.error(e.message); } finally { setLoading(false); } }, [toast]);
  useEffect(() => { load(); }, [load]);

  const receive = async (po) => { setBusy(po.id || po._id); try { await receivePurchaseOrder(po.id || po._id); toast.success('Received — stock updated'); load(); } catch (e) { toast.error(e.message); } finally { setBusy(null); } };
  const cancel = async (po) => { setBusy(po.id || po._id); try { await cancelPurchaseOrder(po.id || po._id); toast.success('Cancelled'); load(); } catch (e) { toast.error(e.message); } finally { setBusy(null); } };

  if (loading) return <Spinner full />;
  return (
    <div className="space-y-4">
      {canManage && <div className="flex justify-end"><Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> New PO</Button></div>}
      {items.length === 0 ? <EmptyState icon={ClipboardList} title="No purchase orders" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">PO No</th><th className="px-4 py-3 font-medium">Vendor</th>
              <th className="px-4 py-3 font-medium">Items</th><th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Status</th>
              {canManage && <th className="px-4 py-3 text-right font-medium">Actions</th>}
            </tr></thead>
            <tbody>
              {items.map((po) => {
                const meta = PO_STATUS_META[po.status] || { label: po.status, tone: 'neutral' };
                const id = po.id || po._id;
                return (
                  <tr key={id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                    <td className="px-4 py-3 font-mono text-xs">{po.poNo}</td>
                    <td className="px-4 py-3">{po.vendor?.name}</td>
                    <td className="px-4 py-3 tabular-nums text-muted">{po.items?.length}</td>
                    <td className="px-4 py-3 tabular-nums">₹{po.total}</td>
                    <td className="px-4 py-3">{formatDate(po.orderedAt)}</td>
                    <td className="px-4 py-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                    {canManage && (
                      <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">
                        {po.status === 'ORDERED' && <>
                          <Button className="h-8 !px-2" onClick={() => receive(po)} loading={busy === id}><PackageCheck className="h-4 w-4" /> Receive</Button>
                          <button onClick={() => cancel(po)} disabled={busy === id} className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10" title="Cancel"><XCircle className="h-4 w-4" /></button>
                        </>}
                      </div></td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <NewPurchaseOrder open={formOpen} onClose={() => setFormOpen(false)} onCreated={load} />
    </div>
  );
}

export default function Inventory() {
  const { role } = useAuth();
  const canManage = CAN_INVENTORY_MANAGE.includes(role);
  const [tab, setTab] = useState('Items');
  const [stats, setStats] = useState(null);
  useEffect(() => { getInventoryStats().then(setStats).catch(() => {}); }, [tab]);

  return (
    <div className="space-y-5">
      <div>
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
      {tab === 'Items' && <Items canManage={canManage} />}
      {tab === 'Vendors' && <Vendors canManage={canManage} />}
      {tab === 'Purchase Orders' && <PurchaseOrders canManage={canManage} />}
    </div>
  );
}
