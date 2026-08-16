import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import Input from '../../components/ui/Input.jsx';
import Button from '../../components/ui/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { receiveBatch } from '../../services/pharmacyService.js';

export default function ReceiveBatchModal({ medicine, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ batchNo: '', expiryDate: '', quantity: '', purchasePrice: '', mrp: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (medicine) setForm({ batchNo: '', expiryDate: '', quantity: '', purchasePrice: medicine.purchasePrice || '', mrp: medicine.mrp || '' }); }, [medicine]);

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await receiveBatch(medicine.id || medicine._id, {
        batchNo: form.batchNo, expiryDate: form.expiryDate, quantity: Number(form.quantity),
        purchasePrice: Number(form.purchasePrice) || 0, mrp: Number(form.mrp) || 0,
      });
      toast.success('Stock received'); onSaved(); onClose();
    } catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };

  return (
    <Modal open={!!medicine} onClose={onClose} size="md" title={medicine ? `Receive Stock · ${medicine.name}` : ''}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="batch-f" loading={saving}>Receive</Button></>}>
      <form id="batch-f" onSubmit={submit} className="grid grid-cols-2 gap-4">
        <Input label="Batch No *" value={form.batchNo} onChange={(e) => setForm({ ...form, batchNo: e.target.value })} required />
        <Input label="Expiry Date *" type="date" min={new Date().toISOString().slice(0, 10)} value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} required />
        <Input label="Quantity *" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
        <Input label="Purchase ₹" type="number" step="0.01" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} />
        <Input label="MRP ₹" type="number" step="0.01" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} />
      </form>
    </Modal>
  );
}
