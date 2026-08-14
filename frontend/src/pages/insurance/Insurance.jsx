import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldPlus, Plus } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Select from '../../components/ui/Select.jsx';
import Input from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import PatientPicker from '../appointments/PatientPicker.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listClaims, createClaim, getInsuranceStats } from '../../services/insuranceService.js';
import { listInvoices } from '../../services/billingService.js';
import { CLAIM_STATUS_META, money, formatDate } from '../../utils/constants.js';

const STATUS_FILTER = [{ value: 'ALL', label: 'All status' },
  ...Object.entries(CLAIM_STATUS_META).map(([value, m]) => ({ value, label: m.label }))];

function NewClaim({ open, onClose, onCreated }) {
  const toast = useToast();
  const [patient, setPatient] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [form, setForm] = useState({ invoice: '', insuranceCompany: '', policyNumber: '', preAuthNo: '', claimAmount: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setPatient(null); setInvoices([]); setForm({ invoice: '', insuranceCompany: '', policyNumber: '', preAuthNo: '', claimAmount: '' }); setErrors({}); } }, [open]);
  useEffect(() => {
    if (patient) listInvoices({ patient: patient.id || patient._id, limit: 50 }).then((r) => setInvoices(r.items)).catch(() => setInvoices([]));
    else setInvoices([]);
  }, [patient]);

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (!patient) er.patient = 'Select a patient';
    if (!form.insuranceCompany.trim()) er.company = 'Required';
    if (!(Number(form.claimAmount) > 0)) er.amount = 'Required';
    setErrors(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    try {
      const claim = await createClaim({ patient: patient.id || patient._id, invoice: form.invoice || null, insuranceCompany: form.insuranceCompany, policyNumber: form.policyNumber, preAuthNo: form.preAuthNo, claimAmount: Number(form.claimAmount) });
      toast.success(`Claim created · ${claim.claimNo}`); onCreated(); onClose();
    } catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };

  const invoiceOpts = [{ value: '', label: 'No invoice linked' }, ...invoices.map((i) => ({ value: i.id || i._id, label: `${i.invoiceNo} · ${money(i.grandTotal)} (due ${money(i.dueAmount)})` }))];
  return (
    <Modal open={open} onClose={onClose} size="xl" title="New Insurance Claim"
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" form="claim-f" loading={saving}>Create Claim</Button></>}>
      <form id="claim-f" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><PatientPicker value={patient} onChange={setPatient} error={errors.patient} /></div>
        <Select className="sm:col-span-2" label="Linked Invoice (optional)" options={invoiceOpts} value={form.invoice} onChange={(e) => setForm({ ...form, invoice: e.target.value })} />
        <Input label="Insurance Company *" value={form.insuranceCompany} onChange={(e) => setForm({ ...form, insuranceCompany: e.target.value })} error={errors.company} />
        <Input label="Policy Number" value={form.policyNumber} onChange={(e) => setForm({ ...form, policyNumber: e.target.value })} />
        <Input label="Pre-Auth No" value={form.preAuthNo} onChange={(e) => setForm({ ...form, preAuthNo: e.target.value })} />
        <Input type="number" step="0.01" label="Claim Amount ₹ *" value={form.claimAmount} onChange={(e) => setForm({ ...form, claimAmount: e.target.value })} error={errors.amount} />
      </form>
    </Modal>
  );
}

function Stat({ label, value }) {
  return <Card className="!p-4"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></Card>;
}

export default function Insurance() {
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 20 } });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try { setData(await listClaims({ page, limit: 20, status })); getInsuranceStats().then(setStats).catch(() => {}); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setLoading(false); }
  }, [page, status, toast]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const { items, pagination } = data;
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Insurance Claims</h1>
          <p className="mt-0.5 text-sm text-muted">{pagination.total} claim{pagination.total === 1 ? '' : 's'}</p>
        </div>
        <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> New Claim</Button>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Total Claimed" value={money(stats.claimed)} />
          <Stat label="Approved" value={money(stats.approved)} />
          <Stat label="Pending Review" value={stats.pending} />
        </div>
      )}

      <div className="w-full sm:w-48"><Select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} options={STATUS_FILTER} /></div>

      <div className="card overflow-hidden">
        {loading ? <Spinner full /> : items.length === 0 ? (
          <EmptyState icon={ShieldPlus} title="No claims" description="Create an insurance claim for a patient."
            action={<Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> New Claim</Button>} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">Claim No</th><th className="px-4 py-3 font-medium">Patient</th>
                  <th className="px-4 py-3 font-medium">Insurer</th><th className="px-4 py-3 font-medium">Claimed</th>
                  <th className="px-4 py-3 font-medium">Approved</th><th className="px-4 py-3 font-medium">Status</th>
                </tr></thead>
                <tbody>
                  {items.map((c) => {
                    const meta = CLAIM_STATUS_META[c.status] || { label: c.status, tone: 'neutral' };
                    return (
                      <tr key={c.id || c._id} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface" onClick={() => navigate(`/insurance/${c.id || c._id}`)}>
                        <td className="px-4 py-3 font-mono text-xs">{c.claimNo}</td>
                        <td className="px-4 py-3">{c.patient?.firstName} {c.patient?.lastName}</td>
                        <td className="px-4 py-3">{c.insuranceCompany}</td>
                        <td className="px-4 py-3 tabular-nums">{money(c.claimAmount)}</td>
                        <td className="px-4 py-3 tabular-nums">{c.approvedAmount ? money(c.approvedAmount) : '—'}</td>
                        <td className="px-4 py-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} limit={pagination.limit} onChange={setPage} />
          </>
        )}
      </div>

      <NewClaim open={formOpen} onClose={() => setFormOpen(false)} onCreated={fetchData} />
    </div>
  );
}
