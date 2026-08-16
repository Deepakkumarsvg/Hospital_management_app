import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import Input from '../../components/ui/Input.jsx';
import Button from '../../components/ui/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { adjustStock } from '../../services/pharmacyService.js';

// Manual correction for damage/loss/count mismatch — not a receipt or a
// dispense, so it's tracked separately with a mandatory reason.
export default function AdjustStockModal({ medicine, onClose, onSaved }) {
  const toast = useToast();
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (medicine) { setDelta(''); setReason(''); } }, [medicine]);

  const submit = async (e) => {
    e.preventDefault();
    const n = Number(delta);
    if (!n) { toast.error('Enter a non-zero quantity'); return; }
    if (!reason.trim()) { toast.error('Reason is required'); return; }
    setSaving(true);
    try {
      await adjustStock(medicine.id || medicine._id, { delta: n, reason: reason.trim() });
      toast.success('Stock adjusted'); onSaved(); onClose();
    } catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };

  return (
    <Modal open={!!medicine} onClose={onClose} size="md" title={medicine ? `Adjust Stock · ${medicine.name}` : ''}
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" form="adj-f" loading={saving}>Apply</Button></>}>
      <form id="adj-f" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted">Current stock: <span className="font-medium text-fg">{medicine?.currentStock}</span> {medicine?.unit?.toLowerCase()}</p>
        <Input label="Quantity change *" type="number" value={delta} onChange={(e) => setDelta(e.target.value)}
          placeholder="e.g. -5 for damage, 10 for count correction" />
        <div>
          <label className="label">Reason *</label>
          <textarea rows={2} className="input resize-y" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Damaged in storage, physical count correction…" />
        </div>
      </form>
    </Modal>
  );
}
