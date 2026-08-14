import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Send, Search, CheckCircle2, XCircle, Banknote } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getClaim, changeClaimStatus } from '../../services/insuranceService.js';
import { CLAIM_STATUS_META, CLAIM_NEXT, money, formatDateTime } from '../../utils/constants.js';

const ACTION = {
  SUBMITTED: { label: 'Submit', icon: Send },
  UNDER_REVIEW: { label: 'Mark Under Review', icon: Search },
  APPROVED: { label: 'Approve', icon: CheckCircle2 },
  REJECTED: { label: 'Reject', icon: XCircle, danger: true },
  SETTLED: { label: 'Settle', icon: Banknote },
};

function Field({ label, value }) {
  return <div><p className="text-xs uppercase tracking-wide text-muted">{label}</p><p className="mt-0.5 text-sm">{value || '—'}</p></div>;
}

export default function ClaimDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [claim, setClaim] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveAmount, setApproveAmount] = useState('');

  const load = async () => {
    setLoading(true);
    try { setClaim(await getClaim(id)); }
    catch (err) { toast.error(err.message || 'Not found'); navigate('/insurance'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (loading) return <Spinner full />;
  if (!claim) return null;
  const meta = CLAIM_STATUS_META[claim.status] || { label: claim.status, tone: 'neutral' };
  const nexts = CLAIM_NEXT[claim.status] || [];

  const doStatus = async (status, approvedAmount) => {
    setBusy(true);
    try { setClaim(await changeClaimStatus(id, { status, approvedAmount })); toast.success(`Claim ${CLAIM_STATUS_META[status].label}`); load(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setBusy(false); setApproveOpen(false); }
  };

  return (
    <div className="space-y-5">
      <Link to="/insurance" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" /> Back to Insurance</Link>

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-muted" />
            <h1 className="text-xl font-semibold">{claim.claimNo}</h1>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">{claim.patient?.firstName} {claim.patient?.lastName} · {claim.insuranceCompany}{claim.invoice ? ` · ${claim.invoice.invoiceNo}` : ''}</p>
        </div>
        {nexts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {nexts.map((s) => {
              const a = ACTION[s]; const Icon = a.icon;
              const onClick = () => s === 'APPROVED' ? (setApproveAmount(String(claim.claimAmount)), setApproveOpen(true)) : doStatus(s);
              return <Button key={s} variant={a.danger ? 'outline' : 'primary'} onClick={onClick} loading={busy} className={a.danger ? '!text-red-500' : ''}><Icon className="h-4 w-4" /> {a.label}</Button>;
            })}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-sm font-semibold">Claim Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Insurance Company" value={claim.insuranceCompany} />
            <Field label="Policy Number" value={claim.policyNumber} />
            <Field label="Pre-Auth No" value={claim.preAuthNo} />
            <Field label="Claim Amount" value={money(claim.claimAmount)} />
            <Field label="Approved Amount" value={claim.approvedAmount ? money(claim.approvedAmount) : '—'} />
            <Field label="Rejected Amount" value={claim.rejectedAmount ? money(claim.rejectedAmount) : '—'} />
            {claim.invoice && <Field label="Linked Invoice" value={`${claim.invoice.invoiceNo} · due ${money(claim.invoice.dueAmount)}`} />}
          </div>
          {claim.notes && <p className="mt-4 text-sm text-muted">Notes: {claim.notes}</p>}
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold">Status History</h2>
          <ul className="space-y-3">
            {[...claim.history].reverse().map((h, i) => {
              const m = CLAIM_STATUS_META[h.status] || { label: h.status, tone: 'neutral' };
              return (
                <li key={i} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <Badge tone={m.tone}>{m.label}</Badge>
                  <span className="text-xs text-muted">{h.by?.name ? `${h.by.name} · ` : ''}{formatDateTime(h.at)}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {approveOpen && (
        <Modal open onClose={() => setApproveOpen(false)} size="sm" title="Approve Claim"
          footer={<><Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button><Button onClick={() => doStatus('APPROVED', Number(approveAmount))} loading={busy}>Approve</Button></>}>
          <p className="mb-3 text-sm text-muted">Claim amount: {money(claim.claimAmount)}</p>
          <Input type="number" step="0.01" label="Approved Amount ₹" value={approveAmount} onChange={(e) => setApproveAmount(e.target.value)} />
          <p className="mt-2 text-xs text-muted">On settlement, this amount is posted as an insurance payment to the linked invoice.</p>
        </Modal>
      )}
    </div>
  );
}
