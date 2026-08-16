import { useEffect, useState } from 'react';
import { PackageOpen } from 'lucide-react';
import Modal from '../../components/ui/Modal.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { itemBatches } from '../../services/inventoryService.js';
import { formatDate } from '../../utils/constants.js';

export default function InventoryBatchesModal({ item, onClose }) {
  const toast = useToast();
  const [batches, setBatches] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!item) return;
    setLoading(true); setBatches(null);
    itemBatches(item.id || item._id)
      .then(setBatches)
      .catch((err) => toast.error(err.message || 'Failed'))
      .finally(() => setLoading(false));
  }, [item, toast]);

  return (
    <Modal open={!!item} onClose={onClose} size="lg" title={item ? `Batches · ${item.name}` : ''}>
      {loading ? <Spinner full /> : !batches || batches.length === 0 ? (
        <EmptyState icon={PackageOpen} title="No stock batches" description="Receive stock via a purchase order to see lot-wise batches here." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Batch / PO No</th><th className="px-4 py-3 font-medium">Remaining</th>
              <th className="px-4 py-3 font-medium">Received</th><th className="px-4 py-3 font-medium">Expiry</th>
              <th className="px-4 py-3 font-medium">Unit Price</th>
            </tr></thead>
            <tbody>
              {batches.map((b) => {
                const expired = b.expiryDate && new Date(b.expiryDate) < new Date();
                return (
                  <tr key={b.id || b._id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs">{b.batchNo}</td>
                    <td className="px-4 py-3 tabular-nums font-medium">{b.quantity}</td>
                    <td className="px-4 py-3 tabular-nums text-muted">{b.receivedQuantity}</td>
                    <td className="px-4 py-3">
                      {b.expiryDate ? <>{formatDate(b.expiryDate)} {expired && <Badge tone="danger" className="ml-1">Expired</Badge>}</> : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted">₹{b.unitPrice}</td>
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
