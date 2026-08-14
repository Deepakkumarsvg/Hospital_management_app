import { useEffect, useState, useCallback } from 'react';
import { Users, Plus, Pencil, Trash2, Check, X, CalendarCheck } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  listEmployees, createEmployee, updateEmployee, deleteEmployee, activeEmployees,
  listAttendance, markAttendance, listLeaves, createLeave, decideLeave, getHrStats,
} from '../../services/hrService.js';
import { activeDepartments } from '../../services/departmentService.js';
import {
  SHIFT_OPTIONS, ATTENDANCE_STATUS_OPTIONS, LEAVE_TYPE_OPTIONS, LEAVE_STATUS_META, PATIENT_STATUS_OPTIONS, toDateInput, formatDate, money,
} from '../../utils/constants.js';

function Employees() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { setItems(await listEmployees()); } catch (e) { toast.error(e.message); } finally { setLoading(false); } }, [toast]);
  useEffect(() => { load(); activeDepartments().then(setDepartments).catch(() => {}); }, [load]);
  const open = (emp) => { setEditing(emp); setForm(emp ? { name: emp.name, designation: emp.designation, department: emp.department?.id || emp.department?._id || '', phone: emp.phone, email: emp.email, shift: emp.shift, salary: emp.salary, status: emp.status } : { name: '', designation: '', department: '', phone: '', email: '', shift: 'GENERAL', salary: '', status: 'ACTIVE' }); setFormOpen(true); };
  const submit = async (e) => { e.preventDefault(); setSaving(true); try { const p = { ...form, department: form.department || null, salary: Number(form.salary) || 0 }; editing ? await updateEmployee(editing.id || editing._id, p) : await createEmployee(p); toast.success('Saved'); setFormOpen(false); load(); } catch (e2) { toast.error(e2.message); } finally { setSaving(false); } };
  const del = async () => { try { await deleteEmployee(deleting.id || deleting._id); toast.success('Deleted'); setDeleting(null); load(); } catch (e) { toast.error(e.message); } };
  if (loading) return <Spinner full />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => open(null)}><Plus className="h-4 w-4" /> New Employee</Button></div>
      {items.length === 0 ? <EmptyState icon={Users} title="No employees" /> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
          <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted"><th className="px-4 py-3 font-medium">Code</th><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Designation</th><th className="px-4 py-3 font-medium">Shift</th><th className="px-4 py-3 font-medium">Salary</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 text-right font-medium">Actions</th></tr></thead>
          <tbody>{items.map((emp) => (<tr key={emp.id || emp._id} className="border-b border-border/60 last:border-0 hover:bg-surface"><td className="px-4 py-3 font-mono text-xs">{emp.employeeCode}</td><td className="px-4 py-3 font-medium">{emp.name}</td><td className="px-4 py-3 text-muted">{emp.designation || '—'}</td><td className="px-4 py-3">{emp.shift}</td><td className="px-4 py-3 tabular-nums">{money(emp.salary)}</td><td className="px-4 py-3"><Badge tone={emp.status === 'ACTIVE' ? 'success' : 'neutral'}>{emp.status}</Badge></td><td className="px-4 py-3"><div className="flex items-center justify-end gap-1"><button onClick={() => open(emp)} className="btn-ghost h-8 w-8 !p-0"><Pencil className="h-4 w-4" /></button><button onClick={() => setDeleting(emp)} className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button></div></td></tr>))}</tbody>
        </table></div>
      )}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} size="lg" title={editing ? 'Edit Employee' : 'New Employee'} footer={<><Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" form="emp-f" loading={saving}>Save</Button></>}>
        <form id="emp-f" onSubmit={submit} className="grid grid-cols-2 gap-4"><Input label="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /><Input label="Designation" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /><Select label="Department" placeholder="None" options={departments.map((d) => ({ value: d.id || d._id, label: d.name }))} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /><Select label="Shift" options={SHIFT_OPTIONS} value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })} /><Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /><Input label="Salary ₹" type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} />{editing && <Select label="Status" options={PATIENT_STATUS_OPTIONS} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />}</form>
      </Modal>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={del} title="Delete employee?" message={deleting ? `Delete ${deleting.name}?` : ''} confirmLabel="Delete" />
    </div>
  );
}

function AttendanceTab() {
  const toast = useToast();
  const [employees, setEmployees] = useState([]);
  const [date, setDate] = useState(toDateInput(new Date().toISOString()));
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); try { const [emps, recs] = await Promise.all([activeEmployees(), listAttendance({ date })]); setEmployees(emps); setRecords(recs); } catch (e) { toast.error(e.message); } finally { setLoading(false); } }, [date, toast]);
  useEffect(() => { load(); }, [load]);
  const recFor = (id) => records.find((r) => (r.employee?.id || r.employee?._id) === id);
  const mark = async (emp, status) => { try { await markAttendance({ employee: emp.id || emp._id, date, status }); toast.success(`${emp.name}: ${status}`); load(); } catch (e) { toast.error(e.message); } };
  if (loading) return <Spinner full />;
  return (
    <div className="space-y-4">
      <div className="w-full sm:w-48"><Input type="date" label="Date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      {employees.length === 0 ? <EmptyState icon={CalendarCheck} title="No active employees" /> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
          <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted"><th className="px-4 py-3 font-medium">Employee</th><th className="px-4 py-3 font-medium">Marked</th><th className="px-4 py-3 text-right font-medium">Mark</th></tr></thead>
          <tbody>{employees.map((emp) => { const r = recFor(emp.id || emp._id); return (
            <tr key={emp.id || emp._id} className="border-b border-border/60 last:border-0 hover:bg-surface"><td className="px-4 py-3 font-medium">{emp.name} <span className="font-mono text-xs text-muted">{emp.employeeCode}</span></td><td className="px-4 py-3">{r ? <Badge tone={r.status === 'PRESENT' ? 'success' : r.status === 'ABSENT' ? 'danger' : 'warning'}>{r.status}</Badge> : <span className="text-muted">—</span>}</td>
            <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">{ATTENDANCE_STATUS_OPTIONS.map((o) => <button key={o.value} onClick={() => mark(emp, o.value)} className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-elevated">{o.label}</button>)}</div></td></tr>
          ); })}</tbody>
        </table></div>
      )}
    </div>
  );
}

function Leaves() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ employee: '', type: 'CASUAL', fromDate: '', toDate: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null);
  const load = useCallback(async () => { setLoading(true); try { const [ls, emps] = await Promise.all([listLeaves(), activeEmployees()]); setItems(ls); setEmployees(emps); } catch (e) { toast.error(e.message); } finally { setLoading(false); } }, [toast]);
  useEffect(() => { load(); }, [load]);
  const submit = async (e) => { e.preventDefault(); setSaving(true); try { await createLeave(form); toast.success('Leave requested'); setFormOpen(false); load(); } catch (e2) { toast.error(e2.message); } finally { setSaving(false); } };
  const decide = async (l, status) => { setBusy(l.id || l._id); try { await decideLeave(l.id || l._id, status); toast.success(`Leave ${status}`); load(); } catch (e) { toast.error(e.message); } finally { setBusy(null); } };
  if (loading) return <Spinner full />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => { setForm({ employee: '', type: 'CASUAL', fromDate: toDateInput(new Date().toISOString()), toDate: toDateInput(new Date().toISOString()), reason: '' }); setFormOpen(true); }}><Plus className="h-4 w-4" /> Request Leave</Button></div>
      {items.length === 0 ? <EmptyState icon={CalendarCheck} title="No leave requests" /> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
          <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted"><th className="px-4 py-3 font-medium">Employee</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">From</th><th className="px-4 py-3 font-medium">To</th><th className="px-4 py-3 font-medium">Days</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 text-right font-medium">Action</th></tr></thead>
          <tbody>{items.map((l) => { const meta = LEAVE_STATUS_META[l.status]; const id = l.id || l._id; return (
            <tr key={id} className="border-b border-border/60 last:border-0 hover:bg-surface"><td className="px-4 py-3 font-medium">{l.employee?.name}</td><td className="px-4 py-3"><Badge>{l.type}</Badge></td><td className="px-4 py-3">{formatDate(l.fromDate)}</td><td className="px-4 py-3">{formatDate(l.toDate)}</td><td className="px-4 py-3 tabular-nums">{l.days}</td><td className="px-4 py-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
            <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">{l.status === 'PENDING' && <><button onClick={() => decide(l, 'APPROVED')} disabled={busy === id} className="rounded-lg border border-green-500/30 px-2 py-1 text-xs text-green-600 hover:bg-green-500/10 dark:text-green-400"><Check className="inline h-3.5 w-3.5" /> Approve</button><button onClick={() => decide(l, 'REJECTED')} disabled={busy === id} className="rounded-lg border border-red-500/30 px-2 py-1 text-xs text-red-500 hover:bg-red-500/10"><X className="inline h-3.5 w-3.5" /> Reject</button></>}</div></td></tr>
          ); })}</tbody>
        </table></div>
      )}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} size="lg" title="Request Leave" footer={<><Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" form="leave-f" loading={saving}>Submit</Button></>}>
        <form id="leave-f" onSubmit={submit} className="grid grid-cols-2 gap-4"><Select className="col-span-2" label="Employee *" placeholder="Select" options={employees.map((e) => ({ value: e.id || e._id, label: `${e.name} (${e.employeeCode})` }))} value={form.employee} onChange={(e) => setForm({ ...form, employee: e.target.value })} required /><Select label="Type" options={LEAVE_TYPE_OPTIONS} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} /><div /><Input type="date" label="From *" value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} required /><Input type="date" label="To *" value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} required /><Input className="col-span-2" label="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></form>
      </Modal>
    </div>
  );
}

export default function HR() {
  const [tab, setTab] = useState('Employees');
  const [stats, setStats] = useState(null);
  useEffect(() => { getHrStats().then(setStats).catch(() => {}); }, [tab]);
  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-semibold">Human Resources</h1><p className="mt-0.5 text-sm text-muted">Employees, attendance and leave management.</p></div>
      {stats && <div className="grid grid-cols-2 gap-4"><Card className="!p-4"><p className="text-xs text-muted">Active Employees</p><p className="mt-1 text-2xl font-semibold">{stats.employees}</p></Card><Card className="!p-4"><p className="text-xs text-muted">Pending Leaves</p><p className={'mt-1 text-2xl font-semibold ' + (stats.pendingLeaves ? 'text-amber-500' : '')}>{stats.pendingLeaves}</p></Card></div>}
      <div className="flex gap-1 border-b border-border">{['Employees', 'Attendance', 'Leaves'].map((t) => <button key={t} onClick={() => setTab(t)} className={'rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ' + (tab === t ? 'border-b-2 border-fg text-fg' : 'text-muted hover:text-fg')}>{t}</button>)}</div>
      {tab === 'Employees' && <Employees />}
      {tab === 'Attendance' && <AttendanceTab />}
      {tab === 'Leaves' && <Leaves />}
    </div>
  );
}
