import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, ShieldCheck, Send, Search, CheckCircle2, XCircle, Banknote, Pencil,
  Upload, FileText, File, Eye, Download, Trash2, RotateCcw,
} from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { PageSkeleton } from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  getClaim, updateClaim, changeClaimStatus,
  listClaimDocuments, uploadClaimDocument, deleteClaimDocument, viewClaimDocument, downloadClaimDocument,
} from '../../services/insuranceService.js';
import { CLAIM_STATUS_META, CLAIM_NEXT, money, formatDate, formatDateTime } from '../../utils/constants.js';

const DOC_CATEGORIES = [
  { value: 'PRE_AUTH', label: 'Pre-Auth Letter' },
  { value: 'DISCHARGE_SUMMARY', label: 'Discharge Summary' },
  { value: 'BILL', label: 'Bill' },
  { value: 'POLICY', label: 'Policy Copy' },
  { value: 'OTHER', label: 'Other' },
];
const DOC_CAT_LABEL = Object.fromEntries(DOC_CATEGORIES.map((c) => [c.value, c.label]));

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const ACTION = {
  SUBMITTED: { label: 'Submit', icon: Send },
  UNDER_REVIEW: { label: 'Mark Under Review', icon: Search },
  APPROVED: { label: 'Approve', icon: CheckCircle2 },
  REJECTED: { label: 'Reject', icon: XCircle, danger: true },
  SETTLED: { label: 'Settle', icon: Banknote },
  DRAFT: { label: 'Reopen for Correction', icon: RotateCcw },
};

function Field({ label, value }) {
  return <div><p className="text-xs uppercase tracking-wide text-muted">{label}</p><p className="mt-0.5 text-sm">{value || '—'}</p></div>;
}

function EditClaimModal({ claim, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    insuranceCompany: claim.insuranceCompany || '',
    policyNumber: claim.policyNumber || '',
    preAuthNo: claim.preAuthNo || '',
    claimAmount: claim.claimAmount || '',
    notes: claim.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try { await updateClaim(claim.id || claim._id, { ...form, claimAmount: Number(form.claimAmount) }); toast.success('Claim updated'); onSaved(); onClose(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title="Edit Draft Claim"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="edit-claim-f" loading={saving}>Save</Button></>}>
      <form id="edit-claim-f" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Insurance Company *" value={form.insuranceCompany} onChange={(e) => setForm({ ...form, insuranceCompany: e.target.value })} required />
        <Input label="Policy Number" value={form.policyNumber} onChange={(e) => setForm({ ...form, policyNumber: e.target.value })} />
        <Input label="Pre-Auth No" value={form.preAuthNo} onChange={(e) => setForm({ ...form, preAuthNo: e.target.value })} />
        <Input type="number" step="0.01" label="Claim Amount ₹ *" value={form.claimAmount} onChange={(e) => setForm({ ...form, claimAmount: e.target.value })} required />
        <div className="sm:col-span-2">
          <label className="label">Notes</label>
          <textarea className="input min-h-20" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </form>
    </Modal>
  );
}

// One modal handles every status transition — Approve needs an amount,
// everything else just takes an optional remark for the history log.
function StatusModal({ claim, target, onClose, onDone }) {
  const toast = useToast();
  const [amount, setAmount] = useState(String(claim.claimAmount));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const a = ACTION[target];

  const submit = async () => {
    setBusy(true);
    try {
      const payload = { status: target, note: note || undefined };
      if (target === 'APPROVED') payload.approvedAmount = Number(amount);
      await changeClaimStatus(claim.id || claim._id, payload);
      toast.success(`Claim ${CLAIM_STATUS_META[target].label}`);
      onDone(); onClose();
    } catch (err) { toast.error(err.message || 'Failed'); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} size="sm" title={a.label}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy} className={a.danger ? '!bg-red-600 hover:!opacity-90' : ''}><a.icon className="h-4 w-4" /> {a.label}</Button></>}>
      {target === 'APPROVED' && (
        <>
          <p className="mb-3 text-sm text-muted">Claim amount: {money(claim.claimAmount)}</p>
          <Input type="number" step="0.01" label="Approved Amount ₹" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </>
      )}
      <div className={target === 'APPROVED' ? 'mt-3' : ''}>
        <label className="label">{target === 'REJECTED' ? 'Reason for rejection' : 'Remark (optional)'}</label>
        <textarea className="input min-h-20" value={note} onChange={(e) => setNote(e.target.value)} placeholder={target === 'REJECTED' ? 'Why is this claim being rejected?' : ''} />
      </div>
      {target === 'SETTLED' && <p className="mt-2 text-xs text-muted">On settlement, the approved amount is posted as an insurance payment to the linked invoice.</p>}
    </Modal>
  );
}

function ClaimDocuments({ claimId }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('OTHER');
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setDocs(await listClaimDocuments(claimId)); }
    catch (err) { toast.error(err.message || 'Failed to load documents'); }
    finally { setLoading(false); }
  }, [claimId, toast]);
  useEffect(() => { load(); }, [load]);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try { await uploadClaimDocument(claimId, file, category); toast.success('Document uploaded'); load(); }
    catch (err) { toast.error(err.message || 'Upload failed'); }
    finally { setUploading(false); }
  };

  const onView = async (doc) => { try { await viewClaimDocument(claimId, doc); } catch (err) { toast.error(err.message || 'Could not open document'); } };
  const onDownload = async (doc) => { try { await downloadClaimDocument(claimId, doc); } catch { toast.error('Could not download file'); } };
  const confirmDelete = async () => {
    setDeleteLoading(true);
    try { await deleteClaimDocument(claimId, deleting.id || deleting._id); toast.success('Document deleted'); setDeleting(null); load(); }
    catch (err) { toast.error(err.message || 'Delete failed'); }
    finally { setDeleteLoading(false); }
  };

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold">Documents</h2>
      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-surface p-4 sm:flex-row sm:items-end">
        <div className="w-full sm:w-56"><Select label="Category" options={DOC_CATEGORIES} value={category} onChange={(e) => setCategory(e.target.value)} /></div>
        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={onPick} />
        <Button onClick={() => fileRef.current?.click()} loading={uploading}><Upload className="h-4 w-4" /> Upload Document</Button>
        <p className="text-xs text-muted sm:ml-auto">PDF, JPG, PNG, WEBP · max 5 MB</p>
      </div>

      {loading ? <Spinner /> : docs.length === 0 ? (
        <EmptyState icon={FileText} title="No documents" description="Attach pre-auth letters, bills, discharge summaries, etc." />
      ) : (
        <div className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border">
          {docs.map((d) => (
            <div key={d.id || d._id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface"><File className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{d.originalName}</p>
                <p className="text-xs text-muted">{humanSize(d.size)} · {formatDate(d.createdAt)}{d.uploadedBy ? ` · ${d.uploadedBy.name}` : ''}</p>
              </div>
              <Badge>{DOC_CAT_LABEL[d.category] || d.category}</Badge>
              <button onClick={() => onView(d)} className="btn-ghost h-8 w-8 !p-0" title="View"><Eye className="h-4 w-4" /></button>
              <button onClick={() => onDownload(d)} className="btn-ghost h-8 w-8 !p-0" title="Download"><Download className="h-4 w-4" /></button>
              <button onClick={() => setDeleting(d)} className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10" title="Delete"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} loading={deleteLoading}
        title="Delete document?" message={deleting ? `Delete "${deleting.originalName}"? This cannot be undone.` : ''} confirmLabel="Delete" />
    </Card>
  );
}

export default function ClaimDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [claim, setClaim] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    try { setClaim(await getClaim(id)); }
    catch (err) { toast.error(err.message || 'Not found'); navigate('/insurance'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (loading) return <PageSkeleton stats={0} />;
  if (!claim) return null;
  const meta = CLAIM_STATUS_META[claim.status] || { label: claim.status, tone: 'neutral' };
  const nexts = CLAIM_NEXT[claim.status] || [];
  const isDraft = claim.status === 'DRAFT';

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
        <div className="flex flex-wrap gap-2">
          {isDraft && <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Edit</Button>}
          {nexts.map((s) => {
            const a = ACTION[s]; const Icon = a.icon;
            return <Button key={s} variant={a.danger ? 'outline' : 'primary'} onClick={() => setStatusTarget(s)} className={a.danger ? '!text-red-500' : ''}><Icon className="h-4 w-4" /> {a.label}</Button>;
          })}
        </div>
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
                <li key={i} className="rounded-lg border border-border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <Badge tone={m.tone}>{m.label}</Badge>
                    <span className="text-xs text-muted">{h.by?.name ? `${h.by.name} · ` : ''}{formatDateTime(h.at)}</span>
                  </div>
                  {h.note && <p className="mt-1.5 text-xs text-muted">{h.note}</p>}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <ClaimDocuments claimId={claim.id || claim._id} />

      {editOpen && <EditClaimModal claim={claim} onClose={() => setEditOpen(false)} onSaved={load} />}
      {statusTarget && <StatusModal claim={claim} target={statusTarget} onClose={() => setStatusTarget(null)} onDone={load} />}
    </div>
  );
}
