import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Receipt } from 'lucide-react';
import Badge from '../../components/ui/Badge.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listInvoices } from '../../services/billingService.js';
import { INVOICE_STATUS_META, money, formatDate } from '../../utils/constants.js';

export default function PatientBilling({ patientId }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listInvoices({ patient: patientId, limit: 50 })
      .then((r) => setItems(r.items))
      .catch((err) => toast.error(err.message || 'Failed to load invoices'))
      .finally(() => setLoading(false));
  }, [patientId, toast]);

  if (loading) return <Spinner full />;
  if (items.length === 0) return <EmptyState icon={Receipt} title="No invoices" description="This patient has no invoices yet." />;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link to={`/billing?patient=${patientId}`} className="text-sm text-muted hover:text-fg hover:underline">
          View all in Billing →
        </Link>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full min-w-[560px] text-sm">
        <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
          <th className="px-4 py-2 font-medium">Invoice No</th><th className="px-4 py-2 font-medium">Total</th>
          <th className="px-4 py-2 font-medium">Paid</th><th className="px-4 py-2 font-medium">Due</th>
          <th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 font-medium">Status</th>
        </tr></thead>
        <tbody>
          {items.map((inv) => {
            const meta = INVOICE_STATUS_META[inv.status] || { label: inv.status, tone: 'neutral' };
            return (
              <tr key={inv.id || inv._id} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface" onClick={() => navigate(`/billing/${inv.id || inv._id}`)}>
                <td className="px-4 py-2 font-mono text-xs">{inv.invoiceNo}</td>
                <td className="px-4 py-2 tabular-nums">{money(inv.grandTotal)}</td>
                <td className="px-4 py-2 tabular-nums text-green-600 dark:text-green-400">{money(inv.paidAmount)}</td>
                <td className="px-4 py-2 tabular-nums">{inv.dueAmount > 0 ? <span className="text-red-500">{money(inv.dueAmount)}</span> : money(0)}</td>
                <td className="px-4 py-2">{formatDate(inv.createdAt)}</td>
                <td className="px-4 py-2"><Badge tone={meta.tone}>{meta.label}</Badge></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
