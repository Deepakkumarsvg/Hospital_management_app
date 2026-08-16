import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import Modal from '../../components/ui/Modal.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { itemTransactions } from '../../services/inventoryService.js';
import { formatDateTime } from '../../utils/constants.js';

const TONE = { IN: 'success', OUT: 'danger', ADJUST: 'warning' };

export default function ItemTransactionsModal({ item, onClose, onViewPO }) {
  const toast = useToast();
  const [txns, setTxns] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!item) return;
    setLoading(true); setTxns(null);
    itemTransactions(item.id || item._id)
      .then(setTxns)
      .catch((err) => toast.error(err.message || 'Failed'))
      .finally(() => setLoading(false));
  }, [item, toast]);

  return (
    <Modal open={!!item} onClose={onClose} size="lg" title={item ? `Stock Movements · ${item.name}` : ''}>
      {loading ? <Spinner full /> : !txns || txns.length === 0 ? (
        <EmptyState icon={History} title="No movements yet" description="Receipts, dispatches and adjustments will show up here." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Qty</th><th className="px-4 py-3 font-medium">Balance After</th>
              <th className="px-4 py-3 font-medium">Reference</th><th className="px-4 py-3 font-medium">By</th>
            </tr></thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id || t._id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 text-muted">{formatDateTime(t.createdAt)}</td>
                  <td className="px-4 py-3"><Badge tone={TONE[t.type] || 'neutral'}>{t.type}</Badge></td>
                  <td className={'px-4 py-3 tabular-nums font-medium ' + (t.quantity < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400')}>
                    {t.quantity > 0 ? `+${t.quantity}` : t.quantity}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{t.balanceAfter}</td>
                  <td className="px-4 py-3 text-muted">
                    {t.reference?.startsWith('PO-') && onViewPO ? (
                      <button onClick={() => onViewPO(t.reference)} className="text-fg hover:underline">{t.reference}</button>
                    ) : (t.reference || t.note || '—')}
                  </td>
                  <td className="px-4 py-3 text-muted">{t.by?.name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
