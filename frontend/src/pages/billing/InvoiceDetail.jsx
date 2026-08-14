import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Receipt, Printer, Wallet, FileDown } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getInvoice, recordPayment, downloadInvoicePdf } from '../../services/billingService.js';
import { CAN_BILLING, INVOICE_STATUS_META, PAYMENT_METHOD_OPTIONS, money, formatDate, formatDateTime } from '../../utils/constants.js';

function PaymentModal({ invoice, onClose, onDone }) {
  const toast = useToast();
  const [amount, setAmount] = useState(invoice?.dueAmount || '');
  const [method, setMethod] = useState('CASH');
  const [txn, setTxn] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try { await recordPayment(invoice.id || invoice._id, { amount: Number(amount), method, transactionId: txn }); toast.success('Payment recorded'); onDone(); onClose(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} size="md" title="Record Payment"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="pay-f" loading={saving}>Record</Button></>}>
      <form id="pay-f" onSubmit={submit} className="grid grid-cols-2 gap-4">
        <p className="col-span-2 text-sm text-muted">Amount due: <span className="font-medium text-fg">{money(invoice.dueAmount)}</span></p>
        <Input type="number" step="0.01" label="Amount ₹" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <Select label="Method" options={PAYMENT_METHOD_OPTIONS} value={method} onChange={(e) => setMethod(e.target.value)} />
        <Input className="col-span-2" label="Transaction ID" value={txn} onChange={(e) => setTxn(e.target.value)} />
      </form>
    </Modal>
  );
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const toast = useToast();
  const canManage = CAN_BILLING.includes(role);

  const [invoice, setInvoice] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const d = await getInvoice(id); setInvoice(d.invoice); setPayments(d.payments); }
    catch (err) { toast.error(err.message || 'Not found'); navigate('/billing'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (loading) return <Spinner full />;
  if (!invoice) return null;
  const meta = INVOICE_STATUS_META[invoice.status] || { label: invoice.status, tone: 'neutral' };
  const canPay = canManage && invoice.dueAmount > 0 && !['REFUNDED', 'CANCELLED'].includes(invoice.status);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between print:hidden">
        <Link to="/billing" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" /> Back to Billing</Link>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadInvoicePdf(invoice.id || invoice._id, invoice.invoiceNo).catch((e) => toast.error(e.message || 'PDF failed'))}><FileDown className="h-4 w-4" /> PDF</Button>
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
          {canPay && <Button onClick={() => setPayOpen(true)}><Wallet className="h-4 w-4" /> Record Payment</Button>}
        </div>
      </div>

      <Card>
        <div className="flex flex-col justify-between gap-4 border-b border-border pb-4 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-muted" />
              <h1 className="text-xl font-semibold">{invoice.invoiceNo}</h1>
              <Badge tone={meta.tone}>{meta.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted">{invoice.patient?.firstName} {invoice.patient?.lastName} · {invoice.patient?.uhid} · {formatDate(invoice.createdAt)}</p>
          </div>
        </div>

        <div className="overflow-x-auto py-4">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-3 py-2 font-medium">Category</th><th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th><th className="px-3 py-2 text-right font-medium">Unit</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
            </tr></thead>
            <tbody>
              {invoice.items.map((it, i) => (
                <tr key={i} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2"><Badge>{it.category}</Badge></td>
                  <td className="px-3 py-2">{it.description}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{it.quantity}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(it.unitPrice)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="tabular-nums">{money(invoice.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted">Discount</span><span className="tabular-nums">− {money(invoice.discount)}</span></div>
          <div className="flex justify-between"><span className="text-muted">Tax ({invoice.taxPercent}%)</span><span className="tabular-nums">+ {money(invoice.tax)}</span></div>
          <div className="flex justify-between border-t border-border pt-1 text-base font-semibold"><span>Grand Total</span><span className="tabular-nums">{money(invoice.grandTotal)}</span></div>
          <div className="flex justify-between text-green-600 dark:text-green-400"><span>Paid</span><span className="tabular-nums">{money(invoice.paidAmount)}</span></div>
          <div className="flex justify-between font-medium"><span>Due</span><span className="tabular-nums">{money(invoice.dueAmount)}</span></div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold">Payments</h2>
        {payments.length === 0 ? <p className="py-4 text-center text-sm text-muted">No payments recorded.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">Receipt</th><th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Method</th><th className="px-3 py-2 font-medium">By</th><th className="px-3 py-2 font-medium">Date</th>
              </tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id || p._id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{p.receiptNo}</td>
                    <td className="px-3 py-2 tabular-nums">{money(p.amount)}</td>
                    <td className="px-3 py-2"><Badge>{p.method}</Badge></td>
                    <td className="px-3 py-2 text-muted">{p.receivedBy?.name || '—'}</td>
                    <td className="px-3 py-2">{formatDateTime(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {payOpen && <PaymentModal invoice={invoice} onClose={() => setPayOpen(false)} onDone={load} />}
    </div>
  );
}
