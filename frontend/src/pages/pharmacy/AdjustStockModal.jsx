import { useEffect, useMemo, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Button from '../../components/ui/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { adjustStock, getMedicine } from '../../services/pharmacyService.js';

// Manual correction for damage/loss/count mismatch — not a receipt or a
// dispense, so it's tracked separately with a mandatory reason.
//
// Adding stock back has to name the batch it belongs to: stock with no expiry
// date cannot be dispensed, so "+50" on its own is not something the pharmacy
// is allowed to record. Taking stock away needs no batch — it comes off FEFO.
export default function AdjustStockModal({ medicine, onClose, onSaved }) {
  const toast = useToast();
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [batches, setBatches] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!medicine) return;
    setDelta(''); setReason(''); setBatchNo(''); setExpiryDate(''); setBatches([]);
    getMedicine(medicine.id || medicine._id)
      .then((d) => setBatches(d?.batches || []))
      .catch(() => setBatches([]));
  }, [medicine]);

  const adding = Number(delta) > 0;
  // An existing batch already carries its expiry; only a brand-new one needs it.
  const isNewBatch = useMemo(
    () => !!batchNo && !batches.some((b) => b.batchNo === batchNo),
    [batchNo, batches]
  );

  const submit = async (e) => {
    e.preventDefault();
    const n = Number(delta);
    if (!n) { toast.error('Enter a non-zero quantity'); return; }
    if (!reason.trim()) { toast.error('Reason is required'); return; }
    if (n > 0 && !batchNo.trim()) { toast.error('Adding stock requires a batch number'); return; }
    if (n > 0 && isNewBatch && !expiryDate) { toast.error('A new batch needs an expiry date'); return; }

    setSaving(true);
    try {
      const payload = { delta: n, reason: reason.trim() };
      if (n > 0) {
        payload.batchNo = batchNo.trim();
        if (isNewBatch) payload.expiryDate = expiryDate;
      }
      await adjustStock(medicine.id || medicine._id, payload);
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

        {adding && (
          <>
            <div>
              <label className="label">Batch *</label>
              {batches.length > 0 && (
                <Select
                  className="mb-2"
                  placeholder="— New batch —"
                  value={batches.some((b) => b.batchNo === batchNo) ? batchNo : ''}
                  onChange={(e) => { setBatchNo(e.target.value); setExpiryDate(''); }}
                  options={batches.map((b) => ({
                    value: b.batchNo,
                    label: `${b.batchNo} · exp ${String(b.expiryDate).slice(0, 10)} · ${b.quantity} left`,
                  }))}
                />
              )}
              <Input value={batchNo} onChange={(e) => setBatchNo(e.target.value)}
                placeholder="Batch number found on the pack" />
            </div>
            {isNewBatch && (
              <Input label="Expiry date *" type="date" value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)} />
            )}
          </>
        )}

        <div>
          <label className="label">Reason *</label>
          <textarea rows={2} className="input resize-y" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Damaged in storage, physical count correction…" />
        </div>
      </form>
    </Modal>
  );
}
