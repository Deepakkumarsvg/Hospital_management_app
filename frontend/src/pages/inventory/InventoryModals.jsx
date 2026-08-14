import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../../components/ui/Modal.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Button from '../../components/ui/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  createItem, updateItem, adjustStock, createVendor, updateVendor,
  createPurchaseOrder, activeItems, activeVendors,
} from '../../services/inventoryService.js';
import { ITEM_CATEGORY_OPTIONS, PATIENT_STATUS_OPTIONS } from '../../utils/constants.js';

export function ItemForm({ open, onClose, item, onSaved }) {
  const toast = useToast();
  const isEdit = !!item;
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();
  useEffect(() => { if (open) reset(item || { name: '', code: '', category: 'CONSUMABLE', unit: 'piece', minStock: 5, unitPrice: 0, status: 'ACTIVE' }); }, [open, item, reset]);
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

export function NewPurchaseOrder({ open, onClose, onCreated }) {
  const toast = useToast();
  const [vendors, setVendors] = useState([]);
  const [items, setItems] = useState([]);
  const [vendor, setVendor] = useState('');
  const [rows, setRows] = useState([{ item: '', quantity: 1, unitPrice: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    activeVendors().then(setVendors).catch(() => setVendors([]));
    activeItems().then(setItems).catch(() => setItems([]));
    setVendor(''); setRows([{ item: '', quantity: 1, unitPrice: '' }]); setError('');
  }, [open]);

  const itemById = Object.fromEntries(items.map((i) => [i.id || i._id, i]));
  const setRow = (i, k, v) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const total = rows.reduce((s, r) => s + ((r.unitPrice !== '' ? Number(r.unitPrice) : (itemById[r.item]?.unitPrice || 0)) * (Number(r.quantity) || 0)), 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!vendor) { setError('Select a vendor'); return; }
    const lines = rows.filter((r) => r.item && Number(r.quantity) > 0).map((r) => ({ item: r.item, quantity: Number(r.quantity), unitPrice: r.unitPrice !== '' ? Number(r.unitPrice) : undefined }));
    if (!lines.length) { setError('Add at least one item'); return; }
    setSaving(true);
    try { const po = await createPurchaseOrder({ vendor, items: lines }); toast.success(`PO created · ${po.poNo}`); onCreated(); onClose(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };

  const vendorOpts = vendors.map((v) => ({ value: v.id || v._id, label: `${v.name} (${v.code})` }));
  const itemOpts = items.map((i) => ({ value: i.id || i._id, label: `${i.name} (${i.code})` }));
  return (
    <Modal open={open} onClose={onClose} size="xl" title="New Purchase Order"
      footer={<>
        <span className="mr-auto text-sm text-muted">Total: ₹{total.toFixed(2)}</span>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" form="po-f" loading={saving}>Create PO</Button>
      </>}>
      <form id="po-f" onSubmit={submit} className="space-y-4" noValidate>
        <Select label="Vendor *" placeholder="Select vendor" options={vendorOpts} value={vendor} onChange={(e) => setVendor(e.target.value)} error={error && !vendor ? error : undefined} />
        <div className="space-y-2">
          <label className="label">Items {error && rows.every((r) => !r.item) && <span className="text-red-500">· {error}</span>}</label>
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2">
              <Select className="flex-1" placeholder="Select item" options={itemOpts} value={r.item} onChange={(e) => setRow(i, 'item', e.target.value)} />
              <Input className="w-20" type="number" min="1" placeholder="Qty" value={r.quantity} onChange={(e) => setRow(i, 'quantity', e.target.value)} />
              <Input className="w-28" type="number" step="0.01" placeholder="Unit ₹" value={r.unitPrice} onChange={(e) => setRow(i, 'unitPrice', e.target.value)} />
              <button type="button" onClick={() => setRows((p) => p.filter((_, idx) => idx !== i))} className="btn-ghost h-10 w-10 !p-0 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button type="button" variant="outline" className="h-8" onClick={() => setRows((p) => [...p, { item: '', quantity: 1, unitPrice: '' }])}><Plus className="h-4 w-4" /> Add Item</Button>
        </div>
      </form>
    </Modal>
  );
}
