import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { PackageOpen } from 'lucide-react';
import { useToast } from '../../context/ToastContext.jsx';
import { getMedicine } from '../../services/pharmacyService.js';
import { formatDate } from '../../utils/constants.js';

export default function MedicineBatchesModal({ medicine, onClose }) {
  const toast = useToast();
  const [batches, setBatches] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!medicine) return;
    setLoading(true); setBatches(null);
    getMedicine(medicine.id || medicine._id)
      .then((r) => setBatches(r.batches || []))
      .catch((err) => toast.error(err.message || 'Failed'))
      .finally(() => setLoading(false));
  }, [medicine, toast]);

  return (
    <Modal open={!!medicine} onClose={onClose} size="lg" title={medicine ? `Batches · ${medicine.name}` : ''}>
      {loading ? <ListSkeleton rows={4} /> : !batches || batches.length === 0 ? (
        <EmptyState icon={PackageOpen} title="No stock batches" description="Receive stock to see lot-wise batches here." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Batch No</th><th className="px-4 py-3 font-medium">Remaining</th>
              <th className="px-4 py-3 font-medium">Received</th><th className="px-4 py-3 font-medium">Expiry</th>
              <th className="px-4 py-3 font-medium">Purchase ₹</th><th className="px-4 py-3 font-medium">MRP ₹</th>
            </tr></thead>
            <tbody>
              {batches.map((b) => {
                const expired = new Date(b.expiryDate) < new Date();
                return (
                  <tr key={b.id || b._id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs">{b.batchNo}</td>
                    <td className="px-4 py-3 tabular-nums font-medium">{b.quantity}</td>
                    <td className="px-4 py-3 tabular-nums text-muted">{b.receivedQuantity}</td>
                    <td className="px-4 py-3">{formatDate(b.expiryDate)} {expired && <Badge tone="danger" className="ml-1">Expired</Badge>}</td>
                    <td className="px-4 py-3 tabular-nums text-muted">₹{b.purchasePrice}</td>
                    <td className="px-4 py-3 tabular-nums text-muted">₹{b.mrp}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
