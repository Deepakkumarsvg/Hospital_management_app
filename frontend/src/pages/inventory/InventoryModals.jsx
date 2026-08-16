import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../../components/ui/Modal.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Button from '../../components/ui/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  createItem, updateItem, adjustStock, createVendor, updateVendor, getVendor,
  createPurchaseOrder, updatePurchaseOrder, placeOrder, receivePurchaseOrder, activeItems, activeVendors, itemLastPrice,
} from '../../services/inventoryService.js';
import { ITEM_CATEGORY_OPTIONS, PATIENT_STATUS_OPTIONS, PO_STATUS_META, formatDate, formatDateTime } from '../../utils/constants.js';

// Best-effort code suggestion from the name (e.g. "Surgical Gloves" → "SUR-GLO")
// — just a starting point the user can still edit before saving.
function suggestCode(name) {
  const words = name.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (words.length === 1) return words[0].slice(0, 6);
  return words.slice(0, 2).map((w) => w.slice(0, 3)).join('-');
}

export function ItemForm({ open, onClose, item, onSaved }) {
  const toast = useToast();
  const isEdit = !!item;
  const { register, handleSubmit, reset, watch, getValues, setValue, formState: { errors, isSubmitting } } = useForm();
  useEffect(() => { if (open) reset(item || { name: '', code: '', category: 'CONSUMABLE', unit: 'piece', minStock: 5, unitPrice: 0, status: 'ACTIVE' }); }, [open, item, reset]);

  // Only auto-fill while the code is still untouched — never clobber
  // something the user already typed themselves.
  const name = watch('name');
  useEffect(() => {
    if (isEdit || !name || getValues('code')?.trim()) return;
    setValue('code', suggestCode(name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, isEdit]);

  const onSubmit = async (v) => {
    try { isEdit ? await updateItem(item.id || item._id, v) : await createItem(v); toast.success(isEdit ? 'Updated' : 'Created'); onSaved(); onClose(); }
    catch (err) { toast.error(err.message || 'Failed'); }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={isEdit ? 'Edit Item' : 'New Item'}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="it-f" loading={isSubmitting}>{isEdit ? 'Save' : 'Create'}</Button></>}>
      <form id="it-f" onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-4" noValidate>
        <Input label="Name *" error={errors.name?.message} {...register('name', { required: 'Required' })} />
        <Input label="Code *" className="uppercase" error={errors.code?.message} {...register('code', { required: 'Required' })} />
        <Select label="Category" options={ITEM_CATEGORY_OPTIONS} {...register('category')} />
        <Input label="Unit" {...register('unit')} />
        <Input label="Min Stock" type="number" {...register('minStock')} />
        <Input label="Unit Price ₹" type="number" step="0.01" {...register('unitPrice')} />
        {isEdit && <Input label="Last Purchase Price ₹" type="number" step="0.01" {...register('lastPurchasePrice')} />}
        {isEdit && <Select label="Status" options={PATIENT_STATUS_OPTIONS} {...register('status')} />}
      </form>
    </Modal>
  );
}

export function AdjustStockModal({ item, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ type: 'IN', quantity: '', reference: '', note: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (item) setForm({ type: 'IN', quantity: '', reference: '', note: '' }); }, [item]);
  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try { await adjustStock(item.id || item._id, { ...form, quantity: Number(form.quantity) }); toast.success('Stock updated'); onSaved(); onClose(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };
  const typeOpts = [{ value: 'IN', label: 'Stock In (+)' }, { value: 'OUT', label: 'Stock Out (−)' }, { value: 'ADJUST', label: 'Adjust (signed)' }];
  return (
    <Modal open={!!item} onClose={onClose} size="md" title={item ? `Adjust Stock · ${item.name}` : ''}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="adj-f" loading={saving}>Apply</Button></>}>
      <form id="adj-f" onSubmit={submit} className="grid grid-cols-2 gap-4">
        <p className="col-span-2 text-sm text-muted">Current stock: <span className="font-medium text-fg">{item?.currentStock}</span></p>
        <Select label="Type" options={typeOpts} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
        <Input label="Quantity" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
        <Input label="Reference" className="col-span-2" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
        <Input label="Note" className="col-span-2" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </form>
    </Modal>
  );
}

export function VendorForm({ open, onClose, vendor, onSaved }) {
  const toast = useToast();
  const isEdit = !!vendor;
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();
  useEffect(() => { if (open) reset(vendor || { name: '', code: '', contactPerson: '', phone: '', email: '', address: '', status: 'ACTIVE' }); }, [open, vendor, reset]);
  const onSubmit = async (v) => {
    try { isEdit ? await updateVendor(vendor.id || vendor._id, v) : await createVendor(v); toast.success(isEdit ? 'Updated' : 'Created'); onSaved(); onClose(); }
    catch (err) { toast.error(err.message || 'Failed'); }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={isEdit ? 'Edit Vendor' : 'New Vendor'}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="v-f" loading={isSubmitting}>{isEdit ? 'Save' : 'Create'}</Button></>}>
      <form id="v-f" onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-4" noValidate>
        <Input label="Name *" error={errors.name?.message} {...register('name', { required: 'Required' })} />
        <Input label="Code *" className="uppercase" error={errors.code?.message} {...register('code', { required: 'Required' })} />
        <Input label="Contact Person" {...register('contactPerson')} />
        <Input label="Phone" {...register('phone')} />
        <Input label="Email" {...register('email')} />
        {isEdit && <Select label="Status" options={PATIENT_STATUS_OPTIONS} {...register('status')} />}
        <Input label="Address" className="col-span-2" {...register('address')} />
      </form>
    </Modal>
  );
}

// `po` (a DRAFT order) switches this into edit mode. `presetItems` lets a
// caller (e.g. "Reorder" on a low-stock item) open it pre-filled.
export function NewPurchaseOrder({ open, onClose, onCreated, po, presetItems }) {
  const toast = useToast();
  const isEdit = !!po;
  const [vendors, setVendors] = useState([]);
  const [items, setItems] = useState([]);
  const [vendor, setVendor] = useState('');
  const [rows, setRows] = useState([{ item: '', quantity: 1, unitPrice: '' }]);
  const [saving, setSaving] = useState(null); // 'DRAFT' | 'ORDERED' | null
  const [error, setError] = useState('');
  const [vendorPrices, setVendorPrices] = useState({}); // `${vendorId}:${itemId}` -> price | null

  useEffect(() => {
    if (!open) return;
    activeVendors().then(setVendors).catch(() => setVendors([]));
    activeItems().then(setItems).catch(() => setItems([]));
    if (po) {
      setVendor(po.vendor?.id || po.vendor?._id || '');
      setRows((po.items || []).map((it) => ({ item: it.item?.id || it.item?._id || it.item, quantity: it.quantity, unitPrice: it.unitPrice })));
    } else if (presetItems?.length) {
      setVendor('');
      setRows(presetItems.map((p) => ({ item: p.item, quantity: p.quantity, unitPrice: '' })));
    } else {
      setVendor(''); setRows([{ item: '', quantity: 1, unitPrice: '' }]);
    }
    setVendorPrices({});
    setError('');
  }, [open, po, presetItems]);

  // Fetch "what did we last pay THIS vendor for THIS item" whenever a row's
  // item or the vendor changes — cached per (vendor, item) so re-selecting
  // doesn't refetch.
  useEffect(() => {
    if (!vendor) return;
    rows.forEach((r) => {
      if (!r.item) return;
      const key = `${vendor}:${r.item}`;
      if (key in vendorPrices) return;
      setVendorPrices((prev) => ({ ...prev, [key]: undefined })); // mark in-flight
      itemLastPrice(r.item, vendor).then((price) => setVendorPrices((prev) => ({ ...prev, [key]: price })))
        .catch(() => setVendorPrices((prev) => ({ ...prev, [key]: null })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendor, rows.map((r) => r.item).join(',')]);

  const itemById = Object.fromEntries(items.map((i) => [i.id || i._id, i]));
  const setRow = (i, k, v) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const total = rows.reduce((s, r) => s + ((r.unitPrice !== '' ? Number(r.unitPrice) : (itemById[r.item]?.unitPrice || 0)) * (Number(r.quantity) || 0)), 0);

  const buildLines = () => rows.filter((r) => r.item && Number(r.quantity) > 0)
    .map((r) => ({ item: r.item, quantity: Number(r.quantity), unitPrice: r.unitPrice !== '' ? Number(r.unitPrice) : undefined }));

  const submit = async (status) => {
    if (!vendor) { setError('Select a vendor'); return; }
    const lines = buildLines();
    if (!lines.length) { setError('Add at least one item'); return; }
    setSaving(status);
    try {
      if (isEdit) {
        const id = po.id || po._id;
        const updated = await updatePurchaseOrder(id, { vendor, items: lines });
        if (status === 'ORDERED') { await placeOrder(id); toast.success(`Order placed · ${updated.poNo}`); }
        else toast.success(`Draft saved · ${updated.poNo}`);
      } else {
        const created = await createPurchaseOrder({ vendor, items: lines, status });
        toast.success(status === 'DRAFT' ? `Draft saved · ${created.poNo}` : `PO created · ${created.poNo}`);
      }
      onCreated(); onClose();
    } catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(null); }
  };

  const vendorOpts = vendors.map((v) => ({ value: v.id || v._id, label: `${v.name} (${v.code})` }));
  const itemOpts = items.map((i) => ({ value: i.id || i._id, label: `${i.name} (${i.code})` }));
  return (
    <Modal open={open} onClose={onClose} size="xl" title={isEdit ? `Edit Draft · ${po.poNo}` : 'New Purchase Order'}
      footer={<>
        <span className="mr-auto text-sm text-muted">Total: ₹{total.toFixed(2)}</span>
        <Button variant="outline" onClick={onClose} disabled={!!saving}>Cancel</Button>
        <Button variant="outline" onClick={() => submit('DRAFT')} loading={saving === 'DRAFT'} disabled={!!saving}>{isEdit ? 'Save Draft' : 'Save as Draft'}</Button>
        <Button onClick={() => submit('ORDERED')} loading={saving === 'ORDERED'} disabled={!!saving}>{isEdit ? 'Save & Place' : 'Place Order'}</Button>
      </>}>
      <form id="po-f" onSubmit={(e) => e.preventDefault()} className="space-y-4" noValidate>
        <Select label="Vendor *" placeholder="Select vendor" options={vendorOpts} value={vendor} onChange={(e) => setVendor(e.target.value)} error={error && !vendor ? error : undefined} />
        <div className="space-y-2">
          <label className="label">Items {error && rows.every((r) => !r.item) && <span className="text-red-500">· {error}</span>}</label>
          {rows.map((r, i) => {
            const vendorPrice = vendor && r.item ? vendorPrices[`${vendor}:${r.item}`] : undefined;
            const overallPrice = itemById[r.item]?.lastPurchasePrice;
            return (
              <div key={i}>
                <div className="flex gap-2">
                  <Select className="flex-1" placeholder="Select item" options={itemOpts} value={r.item} onChange={(e) => setRow(i, 'item', e.target.value)} />
                  <Input className="w-20" type="number" min="1" placeholder="Qty" value={r.quantity} onChange={(e) => setRow(i, 'quantity', e.target.value)} />
                  <Input className="w-28" type="number" step="0.01" placeholder="Unit ₹" value={r.unitPrice} onChange={(e) => setRow(i, 'unitPrice', e.target.value)} />
                  <button type="button" onClick={() => setRows((p) => p.filter((_, idx) => idx !== i))} className="btn-ghost h-10 w-10 !p-0 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                </div>
                {vendorPrice != null ? (
                  <p className="mt-1 text-xs text-muted">Last paid to this vendor: ₹{vendorPrice}</p>
                ) : overallPrice != null && (
                  <p className="mt-1 text-xs text-muted">Last purchased (any vendor) at ₹{overallPrice}</p>
                )}
              </div>
            );
          })}
          <Button type="button" variant="outline" className="h-8" onClick={() => setRows((p) => [...p, { item: '', quantity: 1, unitPrice: '' }])}><Plus className="h-4 w-4" /> Add Item</Button>
        </div>
      </form>
    </Modal>
  );
}

// PO history + lifetime spend for one vendor.
export function VendorDetailModal({ vendorId, onClose }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!vendorId) return;
    setLoading(true); setData(null);
    getVendor(vendorId).then(setData).catch((err) => toast.error(err.message || 'Failed')).finally(() => setLoading(false));
  }, [vendorId, toast]);

  return (
    <Modal open={!!vendorId} onClose={onClose} size="lg" title={data ? data.vendor.name : 'Vendor'}>
      {loading ? <p className="py-8 text-center text-sm text-muted">Loading…</p> : !data ? null : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted">Total Orders</p><p className="mt-1 text-xl font-semibold">{data.stats.totalOrders}</p></div>
            <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted">Lifetime Spend</p><p className="mt-1 text-xl font-semibold">₹{data.stats.totalSpend}</p></div>
            <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted">Last Order</p><p className="mt-1 text-sm font-medium">{data.stats.lastOrderAt ? formatDate(data.stats.lastOrderAt) : '—'}</p></div>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Order History</h3>
            {data.orders.length === 0 ? <p className="py-4 text-center text-sm text-muted">No orders yet.</p> : (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-medium">PO No</th><th className="px-3 py-2 font-medium">Total</th>
                    <th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Date</th>
                  </tr></thead>
                  <tbody>
                    {data.orders.map((o) => {
                      const meta = PO_STATUS_META[o.status] || { label: o.status };
                      return (
                        <tr key={o.id || o._id} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-2 font-mono text-xs">{o.poNo}</td>
                          <td className="px-3 py-2 tabular-nums">₹{o.total}</td>
                          <td className="px-3 py-2">{meta.label}</td>
                          <td className="px-3 py-2 text-muted">{formatDateTime(o.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// Lets the store manager receive a PO in full (default) or record a
// partial/short shipment by editing individual line quantities.
export function ReceivePOModal({ po, onClose, onReceived }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!po) return;
    setRows((po.items || []).map((it) => ({
      item: it.item?.id || it.item?._id || it.item,
      name: it.name,
      outstanding: it.quantity - it.receivedQuantity,
      quantity: it.quantity - it.receivedQuantity,
    })));
  }, [po]);

  const setQty = (i, v) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, quantity: v } : r)));

  const submit = async (e) => {
    e.preventDefault();
    const lines = rows.filter((r) => Number(r.quantity) > 0).map((r) => ({ item: r.item, quantity: Number(r.quantity) }));
    if (!lines.length) { toast.error('Enter at least one quantity to receive'); return; }
    setSaving(true);
    try {
      await receivePurchaseOrder(po.id || po._id, lines);
      toast.success('Stock received'); onReceived(); onClose();
    } catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };

  return (
    <Modal open={!!po} onClose={onClose} size="lg" title={po ? `Receive Stock · ${po.poNo}` : ''}
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" form="recv-f" loading={saving}>Receive</Button></>}>
      <form id="recv-f" onSubmit={submit} className="space-y-3">
        <p className="text-xs text-muted">Defaults to the full outstanding quantity per line — reduce any line to record a partial/short shipment.</p>
        {rows.map((r, i) => {
          const over = Number(r.quantity) > r.outstanding;
          return (
            <div key={r.item}>
              <div className="flex items-center gap-3">
                <span className="flex-1 text-sm">{r.name} <span className="text-xs text-muted">(outstanding {r.outstanding})</span></span>
                <Input className={'w-24' + (over ? ' ring-2 ring-red-500/60' : '')} type="number" min="0" max={r.outstanding} value={r.quantity} onChange={(e) => setQty(i, e.target.value)} />
              </div>
              {over && <p className="mt-1 text-right text-xs text-red-500">Only {r.outstanding} outstanding — will be capped to that</p>}
            </div>
          );
        })}
      </form>
    </Modal>
  );
}
