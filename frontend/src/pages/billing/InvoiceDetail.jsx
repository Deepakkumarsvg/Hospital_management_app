import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Receipt, Printer, Wallet, FileDown, ShieldCheck, Pencil, Ban, Undo2,
  Plus, Trash2, AlertTriangle,
} from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { PageSkeleton } from '../../components/ui/Skeleton.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getInvoice, recordPayment, updateInvoice, cancelInvoice, refundInvoice, downloadInvoicePdf } from '../../services/billingService.js';
import { listClaims } from '../../services/insuranceService.js';
import {
  CAN_BILLING, CAN_BILLING_REVERSE, INVOICE_STATUS_META, INVOICE_CATEGORY_OPTIONS, CLAIM_STATUS_META,
  PAYMENT_METHOD_OPTIONS, money, formatDate, formatDateTime,
} from '../../utils/constants.js';

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
        <Input type="number" step="0.01" min="0.01" max={invoice.dueAmount} label="Amount ₹" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <Select label="Method" options={PAYMENT_METHOD_OPTIONS} value={method} onChange={(e) => setMethod(e.target.value)} />
        <Input className="col-span-2" label="Transaction ID" value={txn} onChange={(e) => setTxn(e.target.value)} />
      </form>
    </Modal>
  );
}

// Only reachable while paidAmount === 0 — once money has moved, items,
// discount and tax are frozen (backend enforces this too; refund first).
function EditInvoiceModal({ invoice, onClose, onDone }) {
  const toast = useToast();
  const [lines, setLines] = useState(invoice.items.map((it) => ({ ...it })));
  const [discount, setDiscount] = useState(String(invoice.discount || 0));
  const [taxPercent, setTaxPercent] = useState(String(invoice.taxPercent || 0));
  const [saving, setSaving] = useState(false);

  const setLine = (i, k, v) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  const subtotal = lines.reduce((s, l) => s + ((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0)), 0);
  const taxable = Math.max(0, subtotal - (Number(discount) || 0));
  const tax = taxable * ((Number(taxPercent) || 0) / 100);
  const grandTotal = taxable + tax;

  const submit = async (e) => {
    e.preventDefault();
    const items = lines.filter((l) => l.description.trim() && Number(l.unitPrice) >= 0)
      .map((l) => ({
        category: l.category, description: l.description, quantity: Number(l.quantity) || 1, unitPrice: Number(l.unitPrice) || 0,
        sourceType: l.sourceType || undefined, sourceId: l.sourceId || undefined,
      }));
    if (items.length === 0) return toast.error('Add at least one line item');
    setSaving(true);
    try {
      await updateInvoice(invoice.id || invoice._id, { items, discount: Number(discount) || 0, taxPercent: Number(taxPercent) || 0 });
      toast.success('Invoice updated'); onDone(); onClose();
    } catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} size="2xl" title={`Edit ${invoice.invoiceNo}`}
      footer={<>
        <span className="mr-auto text-sm font-medium">Total: {money(grandTotal)}</span>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" form="edit-inv-f" loading={saving}>Save Changes</Button>
      </>}>
      <form id="edit-inv-f" onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <label className="label">Line Items</label>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <Select className="col-span-3" options={INVOICE_CATEGORY_OPTIONS} value={l.category} onChange={(e) => setLine(i, 'category', e.target.value)} />
              <Input className="col-span-4" placeholder="Description" value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} />
              <Input className="col-span-2" type="number" min="1" placeholder="Qty" value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} />
              <Input className="col-span-2" type="number" step="0.01" placeholder="Unit ₹" value={l.unitPrice} onChange={(e) => setLine(i, 'unitPrice', e.target.value)} />
              <button type="button" onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} className="btn-ghost col-span-1 h-10 w-10 !p-0 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button type="button" variant="outline" className="h-8" onClick={() => setLines((p) => [...p, { category: 'CONSULTATION', description: '', quantity: 1, unitPrice: '' }])}><Plus className="h-4 w-4" /> Add Line</Button>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
          <Input type="number" min="0" step="0.01" label="Discount ₹" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          <Input type="number" min="0" max="100" step="0.01" label="Tax %" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} />
          <div className="col-span-2 rounded-lg bg-surface p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="tabular-nums">{money(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Discount</span><span className="tabular-nums">− {money(Number(discount) || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Tax</span><span className="tabular-nums">+ {money(tax)}</span></div>
            <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold"><span>Grand Total</span><span className="tabular-nums">{money(grandTotal)}</span></div>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function RefundModal({ invoice, onClose, onDone }) {
  const toast = useToast();
  const [amount, setAmount] = useState(String(invoice.paidAmount));
  const [method, setMethod] = useState('CASH');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await refundInvoice(invoice.id || invoice._id, { amount: Number(amount), method, reason });
      toast.success('Refund recorded'); onDone(); onClose();
    } catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} size="md" title={`Refund ${invoice.invoiceNo}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="refund-f" loading={saving} className="!bg-red-600 hover:!opacity-90"><Undo2 className="h-4 w-4" /> Issue Refund</Button></>}>
      <form id="refund-f" onSubmit={submit} className="grid grid-cols-2 gap-4">
        <p className="col-span-2 text-sm text-muted">Amount paid so far: <span className="font-medium text-fg">{money(invoice.paidAmount)}</span></p>
        <Input type="number" step="0.01" min="0.01" max={invoice.paidAmount} label="Refund Amount ₹" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <Select label="Method" options={PAYMENT_METHOD_OPTIONS} value={method} onChange={(e) => setMethod(e.target.value)} />
        <div className="col-span-2">
          <label className="label">Reason</label>
          <textarea className="input min-h-16" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being refunded?" />
        </div>
        {Number(amount) >= invoice.paidAmount && (
          <p className="col-span-2 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" /> This refunds the full amount paid — the invoice will be marked Refunded.
          </p>
        )}
      </form>
    </Modal>
  );
}

function CancelModal({ invoice, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try { await cancelInvoice(invoice.id || invoice._id, reason); toast.success('Invoice cancelled'); onDone(); onClose(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} size="sm" title={`Cancel ${invoice.invoiceNo}`}
      footer={<><Button variant="outline" onClick={onClose}>Back</Button><Button onClick={submit} loading={saving} className="!bg-red-600 hover:!opacity-90"><Ban className="h-4 w-4" /> Cancel Invoice</Button></>}>
      <p className="mb-3 text-sm text-muted">This voids the invoice permanently. No payment has been recorded against it, so there's nothing to refund.</p>
      <label className="label">Reason (optional)</label>
      <textarea className="input min-h-16" value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const toast = useToast();
  const canManage = CAN_BILLING.includes(role);
  const canReverse = CAN_BILLING_REVERSE.includes(role);

  const [invoice, setInvoice] = useState(null);
  const [payments, setPayments] = useState([]);
  const [claims, setClaims] = useState(null); // null = not fetched/not permitted, [] = none
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const d = await getInvoice(id); setInvoice(d.invoice); setPayments(d.payments); }
    catch (err) { toast.error(err.message || 'Not found'); navigate('/billing'); return; }
    finally { setLoading(false); }
    // Insurance is ADMIN/ACCOUNTANT only — quietly skip for roles without access.
    listClaims({ invoice: id, limit: 5 }).then((r) => setClaims(r.items)).catch(() => setClaims(null));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (loading) return <PageSkeleton stats={0} />;
  if (!invoice) return null;
  const meta = INVOICE_STATUS_META[invoice.status] || { label: invoice.status, tone: 'neutral' };
  const closed = ['REFUNDED', 'CANCELLED'].includes(invoice.status);
  const canPay = canManage && invoice.dueAmount > 0 && !closed;
  const canEdit = canManage && invoice.paidAmount === 0 && !closed;
  const canCancel = canReverse && invoice.paidAmount === 0 && invoice.status === 'PENDING';
  const canRefund = canReverse && invoice.paidAmount > 0 && invoice.status !== 'CANCELLED';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link to="/billing" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" /> Back to Billing</Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => downloadInvoicePdf(invoice.id || invoice._id, invoice.invoiceNo).catch((e) => toast.error(e.message || 'PDF failed'))}><FileDown className="h-4 w-4" /> PDF</Button>
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
          {canEdit && <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Edit</Button>}
          {canPay && <Button onClick={() => setPayOpen(true)}><Wallet className="h-4 w-4" /> Record Payment</Button>}
          {canRefund && <Button variant="outline" onClick={() => setRefundOpen(true)} className="!text-red-500"><Undo2 className="h-4 w-4" /> Refund</Button>}
          {canCancel && <Button variant="outline" onClick={() => setCancelOpen(true)} className="!text-red-500"><Ban className="h-4 w-4" /> Cancel</Button>}
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
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">Receipt</th><th className="px-3 py-2 font-medium">Type</th><th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Method</th><th className="px-3 py-2 font-medium">By</th><th className="px-3 py-2 font-medium">Date</th>
              </tr></thead>
              <tbody>
                {payments.map((p) => {
                  const isRefund = p.type === 'REFUND';
                  return (
                    <tr key={p.id || p._id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs">{p.receiptNo}</td>
                      <td className="px-3 py-2">{isRefund ? <Badge tone="danger">Refund</Badge> : <Badge tone="success">Payment</Badge>}</td>
                      <td className={'px-3 py-2 tabular-nums ' + (isRefund ? 'text-red-500' : '')}>{isRefund ? '− ' : ''}{money(p.amount)}</td>
                      <td className="px-3 py-2"><Badge>{p.method}</Badge></td>
                      <td className="px-3 py-2 text-muted">{p.receivedBy?.name || '—'}</td>
                      <td className="px-3 py-2">{formatDateTime(p.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {claims && claims.length > 0 && (
        <Card className="print:hidden">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-muted" /> Insurance Claims</h2>
          <div className="space-y-2">
            {claims.map((c) => {
              const cmeta = CLAIM_STATUS_META[c.status] || { label: c.status, tone: 'neutral' };
              return (
                <button
                  key={c.id || c._id}
                  onClick={() => navigate(`/insurance/${c.id || c._id}`)}
                  className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-surface"
                >
                  <span><span className="font-mono text-xs">{c.claimNo}</span> · {c.insuranceCompany} · {money(c.claimAmount)}</span>
                  <Badge tone={cmeta.tone}>{cmeta.label}</Badge>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {payOpen && <PaymentModal invoice={invoice} onClose={() => setPayOpen(false)} onDone={load} />}
      {editOpen && <EditInvoiceModal invoice={invoice} onClose={() => setEditOpen(false)} onDone={load} />}
      {refundOpen && <RefundModal invoice={invoice} onClose={() => setRefundOpen(false)} onDone={load} />}
      {cancelOpen && <CancelModal invoice={invoice} onClose={() => setCancelOpen(false)} onDone={load} />}
    </div>
  );
}
