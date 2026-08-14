import { useEffect, useState, useCallback } from 'react';
import { Droplet, Plus, Pencil, Trash2, Send, Ban } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import PatientPicker from '../appointments/PatientPicker.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  getStock, listUnits, collectUnit, issueUnit, discardUnit, listDonors, createDonor, updateDonor, deleteDonor,
} from '../../services/bloodBankService.js';
import { CAN_BLOOD_MANAGE, BLOOD_GROUP_LIST, BLOOD_GROUP_SELECT, BLOOD_COMPONENT_OPTIONS, UNIT_STATUS_META, formatDate } from '../../utils/constants.js';

function Stock({ canManage, onCollect }) {
  const toast = useToast();
  const [stock, setStock] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { getStock().then(setStock).catch((e) => toast.error(e.message)).finally(() => setLoading(false)); }, [toast]);
  if (loading) return <Spinner full />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Card className="!p-4"><p className="text-xs text-muted">Available Units</p><p className="mt-1 text-2xl font-semibold">{stock.totalAvailable}</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Donors</p><p className="mt-1 text-2xl font-semibold">{stock.donors}</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Expiring (7d)</p><p className={'mt-1 text-2xl font-semibold ' + (stock.expiringSoon ? 'text-amber-500' : '')}>{stock.expiringSoon}</p></Card>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BLOOD_GROUP_LIST.map((g) => {
          const c = stock.byGroup[g]?.total || 0;
          return <Card key={g} className="!p-4 text-center"><p className="text-2xl font-bold">{g}</p><p className={'mt-1 text-lg font-semibold tabular-nums ' + (c === 0 ? 'text-red-500' : '')}>{c}</p><p className="text-xs text-muted">units</p></Card>;
        })}
      </div>
    </div>
  );
}

function Units({ canManage }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('AVAILABLE');
  const [issuing, setIssuing] = useState(null);
  const [patient, setPatient] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { setItems(await listUnits({ status })); } catch (e) { toast.error(e.message); } finally { setLoading(false); } }, [status, toast]);
  useEffect(() => { load(); }, [load]);
  const doIssue = async () => { if (!patient) return; setBusy(true); try { await issueUnit(issuing.id || issuing._id, patient.id || patient._id); toast.success('Unit issued'); setIssuing(null); setPatient(null); load(); } catch (e) { toast.error(e.message); } finally { setBusy(false); } };
  const doDiscard = async (u) => { try { await discardUnit(u.id || u._id); toast.success('Discarded'); load(); } catch (e) { toast.error(e.message); } };
  if (loading) return <Spinner full />;
  const filter = [{ value: 'ALL', label: 'All' }, ...Object.entries(UNIT_STATUS_META).map(([v, m]) => ({ value: v, label: m.label }))];
  return (
    <div className="space-y-4">
      <div className="w-full sm:w-48"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={filter} /></div>
      {items.length === 0 ? <EmptyState icon={Droplet} title="No units" /> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
          <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted"><th className="px-4 py-3 font-medium">Unit No</th><th className="px-4 py-3 font-medium">Group</th><th className="px-4 py-3 font-medium">Component</th><th className="px-4 py-3 font-medium">Expiry</th><th className="px-4 py-3 font-medium">Status</th>{canManage && <th className="px-4 py-3 text-right font-medium">Actions</th>}</tr></thead>
          <tbody>{items.map((u) => { const meta = UNIT_STATUS_META[u.status]; return (
            <tr key={u.id || u._id} className="border-b border-border/60 last:border-0 hover:bg-surface">
              <td className="px-4 py-3 font-mono text-xs">{u.unitNo}</td><td className="px-4 py-3"><Badge>{u.bloodGroup}</Badge></td>
              <td className="px-4 py-3 text-muted">{u.component?.replace(/_/g, ' ')}</td><td className="px-4 py-3">{formatDate(u.expiryDate)}</td>
              <td className="px-4 py-3"><Badge tone={meta.tone}>{meta.label}</Badge>{u.issuedTo && <span className="ml-2 text-xs text-muted">→ {u.issuedTo.uhid}</span>}</td>
              {canManage && <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">{u.status === 'AVAILABLE' && <><button onClick={() => { setIssuing(u); setPatient(null); }} className="btn-ghost h-8 !px-2 text-xs"><Send className="h-4 w-4" /> Issue</button><button onClick={() => doDiscard(u)} className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10" title="Discard"><Ban className="h-4 w-4" /></button></>}</div></td>}
            </tr>
          ); })}</tbody>
        </table></div>
      )}
      <Modal open={!!issuing} onClose={() => setIssuing(null)} size="md" title={issuing ? `Issue ${issuing.unitNo} (${issuing.bloodGroup})` : ''} footer={<><Button variant="outline" onClick={() => setIssuing(null)}>Cancel</Button><Button onClick={doIssue} loading={busy} disabled={!patient}>Issue</Button></>}>
        <PatientPicker value={patient} onChange={setPatient} />
      </Modal>
    </div>
  );
}

function Donors({ canManage }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', bloodGroup: 'O+', phone: '', age: '' });
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { setItems(await listDonors()); } catch (e) { toast.error(e.message); } finally { setLoading(false); } }, [toast]);
  useEffect(() => { load(); }, [load]);
  const open = (d) => { setEditing(d); setForm(d ? { name: d.name, bloodGroup: d.bloodGroup, phone: d.phone, age: d.age || '' } : { name: '', bloodGroup: 'O+', phone: '', age: '' }); setFormOpen(true); };
  const submit = async (e) => { e.preventDefault(); setSaving(true); try { const p = { ...form, age: Number(form.age) || null }; editing ? await updateDonor(editing.id || editing._id, p) : await createDonor(p); toast.success('Saved'); setFormOpen(false); load(); } catch (e2) { toast.error(e2.message); } finally { setSaving(false); } };
  const del = async () => { try { await deleteDonor(deleting.id || deleting._id); toast.success('Deleted'); setDeleting(null); load(); } catch (e) { toast.error(e.message); } };
  if (loading) return <Spinner full />;
  return (
    <div className="space-y-4">
      {canManage && <div className="flex justify-end"><Button onClick={() => open(null)}><Plus className="h-4 w-4" /> New Donor</Button></div>}
      {items.length === 0 ? <EmptyState icon={Droplet} title="No donors" /> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
          <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted"><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Group</th><th className="px-4 py-3 font-medium">Phone</th><th className="px-4 py-3 font-medium">Last Donation</th>{canManage && <th className="px-4 py-3 text-right font-medium">Actions</th>}</tr></thead>
          <tbody>{items.map((d) => (<tr key={d.id || d._id} className="border-b border-border/60 last:border-0 hover:bg-surface"><td className="px-4 py-3 font-medium">{d.name}</td><td className="px-4 py-3"><Badge>{d.bloodGroup}</Badge></td><td className="px-4 py-3 tabular-nums">{d.phone || '—'}</td><td className="px-4 py-3">{d.lastDonation ? formatDate(d.lastDonation) : '—'}</td>{canManage && <td className="px-4 py-3"><div className="flex items-center justify-end gap-1"><button onClick={() => open(d)} className="btn-ghost h-8 w-8 !p-0"><Pencil className="h-4 w-4" /></button><button onClick={() => setDeleting(d)} className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button></div></td>}</tr>))}</tbody>
        </table></div>
      )}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} size="md" title={editing ? 'Edit Donor' : 'New Donor'} footer={<><Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" form="donor-f" loading={saving}>Save</Button></>}>
        <form id="donor-f" onSubmit={submit} className="grid grid-cols-2 gap-4"><Input label="Name *" className="col-span-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /><Select label="Blood Group *" options={BLOOD_GROUP_SELECT} value={form.bloodGroup} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })} /><Input label="Age" type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} /><Input label="Phone" className="col-span-2" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></form>
      </Modal>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={del} title="Delete donor?" message={deleting ? `Delete ${deleting.name}?` : ''} confirmLabel="Delete" />
    </div>
  );
}

function CollectModal({ open, onClose, onSaved }) {
  const toast = useToast();
  const [donors, setDonors] = useState([]);
  const [form, setForm] = useState({ bloodGroup: 'O+', component: 'WHOLE_BLOOD', donor: '', expiryDate: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { listDonors().then(setDonors).catch(() => {}); setForm({ bloodGroup: 'O+', component: 'WHOLE_BLOOD', donor: '', expiryDate: '' }); } }, [open]);
  const submit = async (e) => { e.preventDefault(); setSaving(true); try { await collectUnit({ ...form, donor: form.donor || null }); toast.success('Unit collected'); onSaved(); onClose(); } catch (e2) { toast.error(e2.message); } finally { setSaving(false); } };
  return (
    <Modal open={open} onClose={onClose} size="md" title="Collect Blood Unit" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="collect-f" loading={saving}>Collect</Button></>}>
      <form id="collect-f" onSubmit={submit} className="grid grid-cols-2 gap-4">
        <Select label="Blood Group *" options={BLOOD_GROUP_SELECT} value={form.bloodGroup} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })} />
        <Select label="Component" options={BLOOD_COMPONENT_OPTIONS} value={form.component} onChange={(e) => setForm({ ...form, component: e.target.value })} />
        <Select className="col-span-2" label="Donor (optional)" placeholder="Anonymous / camp" options={[{ value: '', label: 'None' }, ...donors.map((d) => ({ value: d.id || d._id, label: `${d.name} (${d.bloodGroup})` }))]} value={form.donor} onChange={(e) => setForm({ ...form, donor: e.target.value })} />
        <Input className="col-span-2" type="date" label="Expiry Date *" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} required />
      </form>
    </Modal>
  );
}

export default function BloodBank() {
  const { role } = useAuth();
  const canManage = CAN_BLOOD_MANAGE.includes(role);
  const [tab, setTab] = useState('Stock');
  const [collectOpen, setCollectOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-semibold">Blood Bank</h1><p className="mt-0.5 text-sm text-muted">Donors, stock by group, collection and issue.</p></div>
        {canManage && <Button onClick={() => setCollectOpen(true)}><Plus className="h-4 w-4" /> Collect Unit</Button>}
      </div>
      <div className="flex gap-1 border-b border-border">{['Stock', 'Units', 'Donors'].map((t) => <button key={t} onClick={() => setTab(t)} className={'rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ' + (tab === t ? 'border-b-2 border-fg text-fg' : 'text-muted hover:text-fg')}>{t}</button>)}</div>
      {tab === 'Stock' && <Stock key={refresh} canManage={canManage} />}
      {tab === 'Units' && <Units key={refresh} canManage={canManage} />}
      {tab === 'Donors' && <Donors key={refresh} canManage={canManage} />}
      <CollectModal open={collectOpen} onClose={() => setCollectOpen(false)} onSaved={() => setRefresh((r) => r + 1)} />
    </div>
  );
}
