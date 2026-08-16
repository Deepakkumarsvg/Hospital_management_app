import { useEffect, useState, useCallback } from 'react';
import { Scissors, Plus, Pencil, Trash2, PlayCircle, CheckCircle2, XCircle, Search, Printer, Eye, Save } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import PatientPicker from '../appointments/PatientPicker.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  listSurgeries, getSurgery, createSurgery, updateSurgery, changeSurgeryStatus, getOtStats,
  listTheatres, activeTheatres, createTheatre, updateTheatre, deleteTheatre,
} from '../../services/otService.js';
import { activeDoctors } from '../../services/doctorService.js';
import { listAdmissions } from '../../services/ipdService.js';
import { CAN_OT_MANAGE, CAN_MANAGE_ADMIN, SURGERY_STATUS_META, SURGERY_NEXT, PATIENT_STATUS_OPTIONS, toDateInput, formatDate, money } from '../../utils/constants.js';

const ACTION = { IN_PROGRESS: { label: 'Start', icon: PlayCircle }, COMPLETED: { label: 'Complete', icon: CheckCircle2 }, CANCELLED: { label: 'Cancel', icon: XCircle, danger: true } };
const STATUS_FILTER = [{ value: 'ALL', label: 'All statuses' }, ...Object.entries(SURGERY_STATUS_META).map(([v, m]) => ({ value: v, label: m.label }))];

function durationLabel(mins) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

function NewSurgery({ open, onClose, onSaved }) {
  const toast = useToast();
  const [theatres, setTheatres] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [patient, setPatient] = useState(null);
  const [admissions, setAdmissions] = useState([]);
  const EMPTY = { theatre: '', surgeon: '', procedure: '', scheduledDate: '', scheduledTime: '09:00', estimatedDuration: '120', admission: '', anesthetist: '', assistants: '', preOpNotes: '', charges: '' };
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    activeTheatres().then(setTheatres).catch(() => {});
    activeDoctors().then(setDoctors).catch(() => {});
    setPatient(null); setAdmissions([]);
    setForm({ ...EMPTY, scheduledDate: toDateInput(new Date().toISOString()) });
    setErr({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!patient) { setAdmissions([]); return; }
    listAdmissions({ patient: patient.id || patient._id, status: 'ADMITTED', limit: 5 })
      .then(({ items }) => setAdmissions(items))
      .catch(() => setAdmissions([]));
  }, [patient]);

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (!patient) er.patient = 'Select a patient';
    if (!form.theatre) er.theatre = 'Select theatre';
    if (!form.surgeon) er.surgeon = 'Select surgeon';
    if (!form.procedure.trim()) er.procedure = 'Required';
    setErr(er); if (Object.keys(er).length) return;
    setSaving(true);
    try {
      const s = await createSurgery({
        patient: patient.id || patient._id, ...form,
        admission: form.admission || undefined,
        estimatedDuration: Number(form.estimatedDuration) || 120,
        charges: Number(form.charges) || 0,
      });
      toast.success(`Scheduled · ${s.surgeryNo}`); onSaved(); onClose();
    } catch (e2) { toast.error(e2.message || 'Failed'); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} size="xl" title="Schedule Surgery"
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" form="surg-f" loading={saving}>Schedule</Button></>}>
      <form id="surg-f" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><PatientPicker value={patient} onChange={setPatient} error={err.patient} /></div>
        {admissions.length > 0 && (
          <Select
            className="sm:col-span-2" label="Link to Admission (optional)" placeholder="None"
            options={admissions.map((a) => ({ value: a.id || a._id, label: `${a.admissionNo} · ${a.ward?.name || ''}` }))}
            value={form.admission} onChange={(e) => setForm({ ...form, admission: e.target.value })}
          />
        )}
        <Select label="Theatre *" placeholder="Select" options={theatres.map((t) => ({ value: t.id || t._id, label: `${t.name} (${t.code})${t.specialization ? ` · ${t.specialization}` : ''}` }))} value={form.theatre} onChange={(e) => setForm({ ...form, theatre: e.target.value })} error={err.theatre} />
        <Select label="Surgeon *" placeholder="Select" options={doctors.map((d) => ({ value: d.id || d._id, label: d.fullName }))} value={form.surgeon} onChange={(e) => setForm({ ...form, surgeon: e.target.value })} error={err.surgeon} />
        <Input className="sm:col-span-2" label="Procedure *" value={form.procedure} onChange={(e) => setForm({ ...form, procedure: e.target.value })} error={err.procedure} />
        <Input type="date" label="Date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} />
        <Input type="time" label="Time" value={form.scheduledTime} onChange={(e) => setForm({ ...form, scheduledTime: e.target.value })} />
        <Input type="number" min="15" step="15" label="Estimated Duration (min)" value={form.estimatedDuration} onChange={(e) => setForm({ ...form, estimatedDuration: e.target.value })} />
        <Input type="number" label="Charges ₹" value={form.charges} onChange={(e) => setForm({ ...form, charges: e.target.value })} />
        <Input label="Anesthetist" value={form.anesthetist} onChange={(e) => setForm({ ...form, anesthetist: e.target.value })} />
        <Input label="Assistants" value={form.assistants} onChange={(e) => setForm({ ...form, assistants: e.target.value })} />
        <Input className="sm:col-span-2" label="Pre-Op Notes" value={form.preOpNotes} onChange={(e) => setForm({ ...form, preOpNotes: e.target.value })} />
      </form>
    </Modal>
  );
}

function Field({ label, children }) {
  return <div><p className="text-xs text-muted">{label}</p><div className="mt-0.5 font-medium">{children}</div></div>;
}

function SurgeryDetailModal({ surgeryId, onClose, onSaved }) {
  const toast = useToast();
  const [s, setS] = useState(null);
  const [theatres, setTheatres] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!surgeryId) return;
    getSurgery(surgeryId).then((data) => {
      setS(data);
      setForm({
        theatre: data.theatre?.id || data.theatre?._id || '',
        surgeon: data.surgeon?.id || data.surgeon?._id || '',
        scheduledDate: toDateInput(data.scheduledDate),
        scheduledTime: data.scheduledTime || '',
        estimatedDuration: data.estimatedDuration || 120,
        anesthetist: data.anesthetist || '',
        assistants: data.assistants || '',
        preOpNotes: data.preOpNotes || '',
        surgeryNotes: data.surgeryNotes || '',
        postOpNotes: data.postOpNotes || '',
        charges: data.charges || 0,
      });
    }).catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surgeryId]);

  useEffect(() => { load(); if (surgeryId) { activeTheatres().then(setTheatres).catch(() => {}); activeDoctors().then(setDoctors).catch(() => {}); } }, [surgeryId, load]);

  if (!surgeryId || !s || !form) return <Modal open={!!surgeryId} onClose={onClose} size="lg" title="Surgery"><Spinner /></Modal>;

  const meta = SURGERY_STATUS_META[s.status];
  const locked = ['COMPLETED', 'CANCELLED'].includes(s.status);
  const scheduleEditable = s.status === 'SCHEDULED';

  const save = async () => {
    setSaving(true);
    try {
      await updateSurgery(s.id || s._id, { ...form, estimatedDuration: Number(form.estimatedDuration) || 120, charges: Number(form.charges) || 0 });
      toast.success('Saved'); load(); onSaved();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <Modal open={!!surgeryId} onClose={onClose} size="xl" title={`${s.surgeryNo} · ${s.procedure}`}
      footer={!locked ? <><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={save} loading={saving}><Save className="h-4 w-4" /> Save Changes</Button></> : <Button variant="outline" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Patient">{s.patient?.firstName} {s.patient?.lastName} <span className="font-mono text-xs text-muted">{s.patient?.uhid}</span></Field>
          <Field label="Status"><Badge tone={meta.tone}>{meta.label}</Badge></Field>
          <Field label="Admission">{s.admission?.admissionNo || '—'}</Field>
          <Field label="Charges">{money(s.charges)}</Field>
        </div>

        {scheduleEditable ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Select label="Theatre" options={theatres.map((t) => ({ value: t.id || t._id, label: `${t.name} (${t.code})` }))} value={form.theatre} onChange={(e) => setForm({ ...form, theatre: e.target.value })} />
            <Select label="Surgeon" options={doctors.map((d) => ({ value: d.id || d._id, label: d.fullName }))} value={form.surgeon} onChange={(e) => setForm({ ...form, surgeon: e.target.value })} />
            <Input type="date" label="Date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} />
            <Input type="time" label="Time" value={form.scheduledTime} onChange={(e) => setForm({ ...form, scheduledTime: e.target.value })} />
            <Input type="number" min="15" step="15" label="Duration (min)" value={form.estimatedDuration} onChange={(e) => setForm({ ...form, estimatedDuration: e.target.value })} />
            <Input type="number" label="Charges ₹" value={form.charges} onChange={(e) => setForm({ ...form, charges: e.target.value })} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Theatre">{s.theatre?.name} ({s.theatre?.code})</Field>
            <Field label="Surgeon">Dr. {s.surgeon?.firstName} {s.surgeon?.lastName}</Field>
            <Field label="Scheduled">{formatDate(s.scheduledDate)} {s.scheduledTime}</Field>
            <Field label="Duration">{durationLabel(s.estimatedDuration)}</Field>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Anesthetist" value={form.anesthetist} disabled={locked} onChange={(e) => setForm({ ...form, anesthetist: e.target.value })} />
          <Input label="Assistants" value={form.assistants} disabled={locked} onChange={(e) => setForm({ ...form, assistants: e.target.value })} />
        </div>
        <Input label="Pre-Op Notes" value={form.preOpNotes} disabled={locked} onChange={(e) => setForm({ ...form, preOpNotes: e.target.value })} />
        <div>
          <label className="label">Surgery Notes (intra-op)</label>
          <textarea className="input min-h-24" disabled={locked} value={form.surgeryNotes} onChange={(e) => setForm({ ...form, surgeryNotes: e.target.value })} />
        </div>
        <div>
          <label className="label">Post-Op Notes</label>
          <textarea className="input min-h-24" disabled={locked} value={form.postOpNotes} onChange={(e) => setForm({ ...form, postOpNotes: e.target.value })} />
        </div>
        {locked && <p className="text-xs text-muted">This surgery is {meta.label.toLowerCase()} and can no longer be edited.</p>}
      </div>
    </Modal>
  );
}

function Surgeries({ canManage }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [busy, setBusy] = useState(null);
  const [theatres, setTheatres] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [status, setStatus] = useState('ALL');
  const [theatre, setTheatre] = useState('ALL');
  const [surgeon, setSurgeon] = useState('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { listTheatres().then(setTheatres).catch(() => {}); activeDoctors().then(setDoctors).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { items: rows, pagination: p } = await listSurgeries({
        page, limit: 20,
        status: status === 'ALL' ? undefined : status,
        theatre: theatre === 'ALL' ? undefined : theatre,
        surgeon: surgeon === 'ALL' ? undefined : surgeon,
        search: search || undefined,
      });
      setItems(rows); setPagination(p);
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, [page, status, theatre, surgeon, search, toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [status, theatre, surgeon, search]);

  const doStatus = async (s, st) => { setBusy(s.id || s._id); try { await changeSurgeryStatus(s.id || s._id, st); toast.success(`Marked ${SURGERY_STATUS_META[st].label}`); load(); } catch (e) { toast.error(e.message); } finally { setBusy(null); } };

  if (loading) return <Spinner full />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search surgery no / procedure…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-full sm:w-44"><Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={STATUS_FILTER} /></div>
        <div className="w-full sm:w-48"><Select label="Theatre" value={theatre} onChange={(e) => setTheatre(e.target.value)} options={[{ value: 'ALL', label: 'All theatres' }, ...theatres.map((t) => ({ value: t.id || t._id, label: t.name }))]} /></div>
        <div className="w-full sm:w-48"><Select label="Surgeon" value={surgeon} onChange={(e) => setSurgeon(e.target.value)} options={[{ value: 'ALL', label: 'All surgeons' }, ...doctors.map((d) => ({ value: d.id || d._id, label: d.fullName }))]} /></div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
          {canManage && <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> Schedule Surgery</Button>}
        </div>
      </div>

      {items.length === 0 ? <EmptyState icon={Scissors} title="No surgeries" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Surgery No</th><th className="px-4 py-3 font-medium">Patient</th><th className="px-4 py-3 font-medium">Procedure</th>
              <th className="px-4 py-3 font-medium">Theatre</th><th className="px-4 py-3 font-medium">Surgeon</th><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr></thead>
            <tbody>
              {items.map((s) => { const meta = SURGERY_STATUS_META[s.status]; const id = s.id || s._id; const nexts = canManage ? (SURGERY_NEXT[s.status] || []) : [];
                return (
                  <tr key={id} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface" onClick={() => setDetailId(id)}>
                    <td className="px-4 py-3 font-mono text-xs">{s.surgeryNo}</td>
                    <td className="px-4 py-3">{s.patient?.firstName} {s.patient?.lastName}</td>
                    <td className="px-4 py-3">{s.procedure}</td>
                    <td className="px-4 py-3 text-muted">{s.theatre?.name}</td>
                    <td className="px-4 py-3 text-muted">Dr. {s.surgeon?.firstName} {s.surgeon?.lastName}</td>
                    <td className="px-4 py-3">{formatDate(s.scheduledDate)} {s.scheduledTime}</td>
                    <td className="px-4 py-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap items-center justify-end gap-1 print:hidden">
                        <button onClick={() => setDetailId(id)} className="btn-ghost h-8 w-8 !p-0" title="View / Edit"><Eye className="h-4 w-4" /></button>
                        {nexts.map((n) => { const a = ACTION[n]; const Icon = a.icon; return <button key={n} onClick={() => doStatus(s, n)} disabled={busy === id} className={'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium disabled:opacity-50 ' + (a.danger ? 'border-red-500/30 text-red-500 hover:bg-red-500/10' : 'border-border hover:bg-elevated')}><Icon className="h-3.5 w-3.5" /> {a.label}</button>; })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="print:hidden">
            <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} limit={pagination.limit} onChange={setPage} />
          </div>
        </div>
      )}
      <NewSurgery open={formOpen} onClose={() => setFormOpen(false)} onSaved={load} />
      <SurgeryDetailModal surgeryId={detailId} onClose={() => setDetailId(null)} onSaved={load} />
    </div>
  );
}

function Theatres({ canAdmin }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const EMPTY = { name: '', code: '', specialization: '', status: 'ACTIVE' };
  const [form, setForm] = useState(EMPTY);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { setItems(await listTheatres()); } catch (e) { toast.error(e.message); } finally { setLoading(false); } }, [toast]);
  useEffect(() => { load(); }, [load]);
  const open = (t) => { setEditing(t); setForm(t ? { name: t.name, code: t.code, specialization: t.specialization || '', status: t.status } : EMPTY); setFormOpen(true); };
  const submit = async (e) => { e.preventDefault(); setSaving(true); try { editing ? await updateTheatre(editing.id || editing._id, form) : await createTheatre(form); toast.success('Saved'); setFormOpen(false); load(); } catch (e2) { toast.error(e2.message); } finally { setSaving(false); } };
  const del = async () => { try { await deleteTheatre(deleting.id || deleting._id); toast.success('Deleted'); setDeleting(null); load(); } catch (e) { toast.error(e.message); } };
  if (loading) return <Spinner full />;
  return (
    <div className="space-y-4">
      {canAdmin && <div className="flex justify-end"><Button onClick={() => open(null)}><Plus className="h-4 w-4" /> New Theatre</Button></div>}
      {items.length === 0 ? <EmptyState icon={Scissors} title="No theatres" /> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
          <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted"><th className="px-4 py-3 font-medium">Code</th><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Specialization</th><th className="px-4 py-3 font-medium">Status</th>{canAdmin && <th className="px-4 py-3 text-right font-medium">Actions</th>}</tr></thead>
          <tbody>{items.map((t) => (<tr key={t.id || t._id} className="border-b border-border/60 last:border-0 hover:bg-surface"><td className="px-4 py-3"><Badge>{t.code}</Badge></td><td className="px-4 py-3 font-medium">{t.name}</td><td className="px-4 py-3 text-muted">{t.specialization || '—'}</td><td className="px-4 py-3"><Badge tone={t.status === 'ACTIVE' ? 'success' : 'neutral'}>{t.status}</Badge></td>{canAdmin && <td className="px-4 py-3"><div className="flex items-center justify-end gap-1"><button onClick={() => open(t)} className="btn-ghost h-8 w-8 !p-0"><Pencil className="h-4 w-4" /></button><button onClick={() => setDeleting(t)} className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button></div></td>}</tr>))}</tbody>
        </table></div>
      )}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} size="sm" title={editing ? 'Edit Theatre' : 'New Theatre'} footer={<><Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" form="ot-f" loading={saving}>Save</Button></>}>
        <form id="ot-f" onSubmit={submit} className="space-y-4">
          <Input label="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Code *" className="uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
          <Input label="Specialization" placeholder="e.g. Cardiac, Ortho, General" value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
          {editing && <Select label="Status" options={PATIENT_STATUS_OPTIONS} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />}
        </form>
      </Modal>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={del} title="Delete theatre?" message={deleting ? `Delete ${deleting.name}?` : ''} confirmLabel="Delete" />
    </div>
  );
}

export default function OT() {
  const { role } = useAuth();
  const canManage = CAN_OT_MANAGE.includes(role);
  const canAdmin = CAN_MANAGE_ADMIN.includes(role);
  const [tab, setTab] = useState('Surgeries');
  const [stats, setStats] = useState(null);
  useEffect(() => { getOtStats().then(setStats).catch(() => {}); }, [tab]);
  return (
    <div className="space-y-5">
      <div className="card p-5 print:hidden"><h1 className="text-xl font-semibold">Operation Theatre</h1><p className="mt-0.5 text-sm text-muted">Surgery scheduling and OT management.</p></div>
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 print:hidden">
          <Card className="!p-4"><p className="text-xs text-muted">Active Theatres</p><p className="mt-1 text-2xl font-semibold">{stats.theatres}</p></Card>
          <Card className="!p-4"><p className="text-xs text-muted">Scheduled / In-progress</p><p className="mt-1 text-2xl font-semibold">{stats.scheduled}</p></Card>
          <Card className="!p-4"><p className="text-xs text-muted">Today</p><p className="mt-1 text-2xl font-semibold">{stats.today}</p></Card>
          <Card className="!p-4"><p className="text-xs text-muted">Completed This Month</p><p className="mt-1 text-2xl font-semibold">{stats.completedThisMonth}</p></Card>
        </div>
      )}
      <div className="flex gap-1 border-b border-border print:hidden">{['Surgeries', 'Theatres'].map((t) => <button key={t} onClick={() => setTab(t)} className={'rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ' + (tab === t ? 'border-b-2 border-fg text-fg' : 'text-muted hover:text-fg')}>{t}</button>)}</div>
      {tab === 'Surgeries' ? <Surgeries canManage={canManage} /> : <div className="print:hidden"><Theatres canAdmin={canAdmin} /></div>}
    </div>
  );
}
