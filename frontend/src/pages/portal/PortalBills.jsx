import { useEffect, useState } from 'react';
import { Receipt, FileDown, CreditCard } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getPortalInvoices, downloadPortalInvoicePdf, payInvoiceOnline } from '../../services/portalService.js';
import { INVOICE_STATUS_META, money, formatDate } from '../../utils/constants.js';

export default function PortalBills() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [paying, setPaying] = useState(null);

  const load = () => getPortalInvoices().then(setItems).catch((e) => { toast.error(e.message || 'Failed to load'); setItems([]); });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const pay = async (inv) => {
    setPaying(inv.id);
    try {
      const res = await payInvoiceOnline(inv.id);
      toast.success(`Paid ${money(inv.dueAmount)} · ${res.payment?.receiptNo || ''}`);
      load();
    } catch (e) { toast.error(e.message || 'Payment failed'); }
    finally { setPaying(null); }
  };

  if (items === null) return <Spinner full />;

  const totalDue = items.reduce((s, i) => s + (i.dueAmount || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">My Bills</h1>
          <p className="mt-0.5 text-sm text-muted">View and download your invoices.</p>
        </div>
        {totalDue > 0 && (
          <div className="text-right">
            <p className="text-xs text-muted">Total due</p>
            <p className="text-lg font-semibold tabular-nums">{money(totalDue)}</p>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Receipt} title="No bills yet" description="Your invoices will appear here." />
      ) : (
        <div className="space-y-3">
          {items.map((inv) => {
            const meta = INVOICE_STATUS_META[inv.status] || {};
            return (
              <Card key={inv.id} className="!p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm font-medium">{inv.invoiceNo}</p>
                      <Badge tone={meta.tone}>{meta.label || inv.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {formatDate(inv.createdAt)} · Total {money(inv.grandTotal)}
                      {inv.dueAmount > 0 ? ` · Due ${money(inv.dueAmount)}` : ' · Paid'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {inv.dueAmount > 0 && (
                      <Button loading={paying === inv.id} onClick={() => pay(inv)}>
                        <CreditCard className="h-4 w-4" /> Pay {money(inv.dueAmount)}
                      </Button>
                    )}
                    <Button variant="outline"
                      onClick={() => downloadPortalInvoicePdf(inv.id, inv.invoiceNo).catch((e) => toast.error(e.message || 'PDF failed'))}>
                      <FileDown className="h-4 w-4" /> PDF
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
