import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Users, Plus, Pencil, Trash2, Check, X, CalendarCheck, Search, Download, CheckCheck,
  Wallet, FileDown, IndianRupee, CalendarClock, Eye, Building2,
} from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  listEmployees, createEmployee, updateEmployee, deleteEmployee, activeEmployees, exportEmployees,
  listAttendance, markAttendance, markAttendanceBulk, getMonthlyAttendanceSummary, exportAttendance,
  listLeaves, createLeave, decideLeave, exportLeaves,
  generatePayroll, listPayslips, adjustPayslip, markPayslipPaid, exportPayslips, downloadPayslipPdf,
  getPayrollByDepartment, getHrStats,
} from '../../services/hrService.js';
import EmployeeDetailModal from './EmployeeDetailModal.jsx';
import { activeDepartments } from '../../services/departmentService.js';
import {
  SHIFT_OPTIONS, ATTENDANCE_STATUS_OPTIONS, LEAVE_TYPE_OPTIONS, LEAVE_STATUS_META, PAYSLIP_STATUS_META,
  MONTH_OPTIONS, PATIENT_STATUS_OPTIONS, toDateInput, formatDate, money,
} from '../../utils/constants.js';

const now = new Date();

function Employees() {
  const toast = useToast();
  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 20 } });
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [deleting, setDeleting] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try { setData(await listEmployees({ page, limit: 20, search, department: department || undefined, status })); }
    catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, [page, search, department, status, toast]);
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { activeDepartments().then(setDepartments).catch(() => {}); }, []);

  const onSearch = (e) => { const v = e.target.value; clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => { setPage(1); setSearch(v); }, 350); };
  const onExport = async (format) => {
    setExporting(format);
    try { await exportEmployees({ search, department: department || undefined, status }, format); }
    catch (err) { toast.error(err.message || 'Export failed'); } finally { setExporting(null); }
  };

  const open = (emp) => {
    setEditing(emp);
    setForm(emp
      ? {
        name: emp.name, designation: emp.designation, department: emp.department?.id || emp.department?._id || '',
        phone: emp.phone, email: emp.email, shift: emp.shift, salary: emp.salary, status: emp.status,
        exitDate: toDateInput(emp.exitDate), exitReason: emp.exitReason || '',
        casual: emp.leaveBalance?.CASUAL ?? 0, sick: emp.leaveBalance?.SICK ?? 0, earned: emp.leaveBalance?.EARNED ?? 0,
      }
      : { name: '', designation: '', department: '', phone: '', email: '', shift: 'GENERAL', salary: '', status: 'ACTIVE', exitDate: '', exitReason: '' });
    setFormOpen(true);
  };
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { casual, sick, earned, exitDate, ...rest } = form;
      const p = { ...rest, department: form.department || null, salary: Number(form.salary) || 0, exitDate: exitDate || null };
      // Balances are only editable while editing an existing employee; new
      // hires start on the model's defaults.
      if (editing) p.leaveBalance = { CASUAL: Number(casual) || 0, SICK: Number(sick) || 0, EARNED: Number(earned) || 0 };
      editing ? await updateEmployee(editing.id || editing._id, p) : await createEmployee(p);
      toast.success('Saved'); setFormOpen(false); fetchData();
    } catch (e2) { toast.error(e2.message); } finally { setSaving(false); }
  };
  const del = async () => {
    try { await deleteEmployee(deleting.id || deleting._id); toast.success('Deleted'); setDeleting(null); fetchData(); }
    catch (e) { toast.error(e.message); }
  };

  const departmentOptions = [{ value: '', label: 'All departments' }, ...departments.map((d) => ({ value: d.id || d._id, label: d.name }))];
  const { items, pagination } = data;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search by name, code, designation…" onChange={onSearch} defaultValue={search} />
        </div>
        <div className="w-full sm:w-44"><Select value={department} onChange={(e) => { setPage(1); setDepartment(e.target.value); }} options={departmentOptions} /></div>
        <div className="w-full sm:w-36"><Select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} options={[{ value: 'ALL', label: 'All status' }, ...PATIENT_STATUS_OPTIONS]} /></div>
        <Button variant="outline" loading={exporting === 'csv'} disabled={!!exporting} onClick={() => onExport('csv')}><Download className="h-4 w-4" /> CSV</Button>
        <Button variant="outline" loading={exporting === 'xlsx'} disabled={!!exporting} onClick={() => onExport('xlsx')}><Download className="h-4 w-4" /> Excel</Button>
        <Button onClick={() => open(null)}><Plus className="h-4 w-4" /> New Employee</Button>
      </div>

      <div className="card overflow-hidden">
        {loading ? <ListSkeleton /> : items.length === 0 ? (
          <EmptyState icon={Users} title={search ? 'No employees match your search' : 'No employees'} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">Code</th>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Designation</th>
                    <th className="px-4 py-3 font-medium">Department</th>
                    <th className="px-4 py-3 font-medium">Shift</th>
                    <th className="px-4 py-3 font-medium">Salary</th>
                    <th className="px-4 py-3 font-medium">Leave Balance</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((emp) => (
                    <tr key={emp.id || emp._id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                      <td className="px-4 py-3 font-mono text-xs">{emp.employeeCode}</td>
                      <td className="px-4 py-3 font-medium">{emp.name}</td>
                      <td className="px-4 py-3 text-muted">{emp.designation || '—'}</td>
                      <td className="px-4 py-3 text-muted">{emp.department?.name || '—'}</td>
                      <td className="px-4 py-3">{emp.shift}</td>
                      <td className="px-4 py-3 tabular-nums">{money(emp.salary)}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted" title="Casual / Sick / Earned">
                          C:{emp.leaveBalance?.CASUAL ?? 0} S:{emp.leaveBalance?.SICK ?? 0} E:{emp.leaveBalance?.EARNED ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3"><Badge tone={emp.status === 'ACTIVE' ? 'success' : 'neutral'}>{emp.status}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setViewing(emp.id || emp._id)} className="btn-ghost h-8 !px-2 text-xs" title="View full record"><Eye className="h-4 w-4" /> View</button>
                          <button onClick={() => open(emp)} className="btn-ghost h-8 w-8 !p-0"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => setDeleting(emp)} className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} limit={pagination.limit} onChange={setPage} />
          </>
        )}
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} size="lg" title={editing ? 'Edit Employee' : 'New Employee'}
        footer={<><Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" form="emp-f" loading={saving}>Save</Button></>}>
        <form id="emp-f" onSubmit={submit} className="grid grid-cols-2 gap-4">
          <Input label="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Designation" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
          <Select label="Department" placeholder="None" options={departments.map((d) => ({ value: d.id || d._id, label: d.name }))} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          <Select label="Shift" options={SHIFT_OPTIONS} value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Salary ₹" type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} />
          {editing && <Select label="Status" options={PATIENT_STATUS_OPTIONS} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />}
          {editing && (
            <>
              <div className="col-span-2 mt-1 border-t border-border pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Leave Balance</p>
                <div className="grid grid-cols-3 gap-3">
                  <Input label="Casual" type="number" value={form.casual} onChange={(e) => setForm({ ...form, casual: e.target.value })} />
                  <Input label="Sick" type="number" value={form.sick} onChange={(e) => setForm({ ...form, sick: e.target.value })} />
                  <Input label="Earned" type="number" value={form.earned} onChange={(e) => setForm({ ...form, earned: e.target.value })} />
                </div>
              </div>
              {form.status === 'INACTIVE' && (
                <>
                  <Input label="Exit Date" type="date" value={form.exitDate} onChange={(e) => setForm({ ...form, exitDate: e.target.value })} />
                  <Input label="Exit Reason" value={form.exitReason} onChange={(e) => setForm({ ...form, exitReason: e.target.value })} placeholder="Resigned, contract ended…" />
                </>
              )}
            </>
          )}
        </form>
      </Modal>
      <EmployeeDetailModal employeeId={viewing} onClose={() => setViewing(null)} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={del} title="Delete employee?" message={deleting ? `Delete ${deleting.name}?` : ''} confirmLabel="Delete" />
    </div>
  );
}

function AttendanceTab() {
  const toast = useToast();
  const [view, setView] = useState('day'); // 'day' | 'month'
  const [employees, setEmployees] = useState([]);
  const [date, setDate] = useState(toDateInput(new Date().toISOString()));
  const [records, setRecords] = useState([]);
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bulkBusy, setBulkBusy] = useState(false);

  const loadDay = useCallback(async () => {
    setLoading(true);
    try { const [emps, res] = await Promise.all([activeEmployees(), listAttendance({ date, limit: 200 })]); setEmployees(emps); setRecords(res.items); }
    catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, [date, toast]);
  const loadMonth = useCallback(async () => {
    setLoading(true);
    try { setSummary(await getMonthlyAttendanceSummary(Number(month), Number(year))); }
    catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, [month, year, toast]);
  useEffect(() => { view === 'day' ? loadDay() : loadMonth(); }, [view, loadDay, loadMonth]);

  const recFor = (id) => records.find((r) => (r.employee?.id || r.employee?._id) === id);
  const mark = async (emp, status) => {
    try { await markAttendance({ employee: emp.id || emp._id, date, status }); toast.success(`${emp.name}: ${status}`); loadDay(); }
    catch (e) { toast.error(e.message); }
  };
  const markAllPresent = async () => {
    setBulkBusy(true);
    try { await markAttendanceBulk({ date, status: 'PRESENT' }); toast.success('Marked everyone present'); loadDay(); }
    catch (e) { toast.error(e.message); } finally { setBulkBusy(false); }
  };
  const onExport = () => exportAttendance({}, 'csv').catch((e) => toast.error(e.message || 'Export failed'));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          {[['day', 'Daily'], ['month', 'Monthly Summary']].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)} className={'rounded-md px-3 py-1.5 text-xs font-medium transition-colors ' + (view === v ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg')}>{l}</button>
          ))}
        </div>
        <Button variant="outline" onClick={onExport}><Download className="h-4 w-4" /> Export CSV</Button>
      </div>

      {view === 'day' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-48"><Input type="date" label="Date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <Button variant="outline" onClick={markAllPresent} loading={bulkBusy}><CheckCheck className="h-4 w-4" /> Mark All Present</Button>
          </div>
          {loading ? <ListSkeleton /> : employees.length === 0 ? <EmptyState icon={CalendarCheck} title="No active employees" /> : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted"><th className="px-4 py-3 font-medium">Employee</th><th className="px-4 py-3 font-medium">Marked</th><th className="px-4 py-3 text-right font-medium">Mark</th></tr></thead>
                <tbody>
                  {employees.map((emp) => {
                    const r = recFor(emp.id || emp._id);
                    return (
                      <tr key={emp.id || emp._id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                        <td className="px-4 py-3 font-medium">{emp.name} <span className="font-mono text-xs text-muted">{emp.employeeCode}</span></td>
                        <td className="px-4 py-3">{r ? <Badge tone={r.status === 'PRESENT' ? 'success' : r.status === 'ABSENT' ? 'danger' : 'warning'}>{r.status}</Badge> : <span className="text-muted">—</span>}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {ATTENDANCE_STATUS_OPTIONS.map((o) => (
                              <button key={o.value} onClick={() => mark(emp, o.value)} className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-elevated">{o.label}</button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-44"><Select label="Month" options={MONTH_OPTIONS} value={month} onChange={(e) => setMonth(e.target.value)} /></div>
            <div className="w-full sm:w-28"><Input label="Year" type="number" value={year} onChange={(e) => setYear(e.target.value)} /></div>
          </div>
          {loading ? <ListSkeleton /> : summary.length === 0 ? <EmptyState icon={CalendarCheck} title="No active employees" /> : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">Employee</th>
                    <th className="px-4 py-3 text-right font-medium">Present</th>
                    <th className="px-4 py-3 text-right font-medium">Absent</th>
                    <th className="px-4 py-3 text-right font-medium">Half Day</th>
                    <th className="px-4 py-3 text-right font-medium">Leave</th>
                    <th className="px-4 py-3 text-right font-medium">Unmarked</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s) => (
                    <tr key={s.employee.id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                      <td className="px-4 py-3 font-medium">{s.employee.name} <span className="font-mono text-xs text-muted">{s.employee.employeeCode}</span></td>
                      <td className="px-4 py-3 text-right tabular-nums text-green-600 dark:text-green-400">{s.present}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-red-500">{s.absent}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.halfDays}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.leaveDays}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">{s.unmarked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Leaves() {
  const toast = useToast();
  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 50 } });
  const [employees, setEmployees] = useState([]);
  const [status, setStatus] = useState('ALL');
  const [employee, setEmployee] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ employee: '', type: 'CASUAL', fromDate: '', toDate: '', halfDay: false, reason: '' });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try { setData(await listLeaves({ page, limit: 50, status, employee: employee || undefined })); }
    catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, [page, status, employee, toast]);
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { activeEmployees().then(setEmployees).catch(() => {}); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await createLeave(form); toast.success('Leave requested'); setFormOpen(false); fetchData(); }
    catch (e2) { toast.error(e2.message); } finally { setSaving(false); }
  };
  const decide = async (l, s) => {
    setBusy(l.id || l._id);
    try { await decideLeave(l.id || l._id, s); toast.success(`Leave ${s}`); fetchData(); }
    catch (e) { toast.error(e.message); } finally { setBusy(null); }
  };
  const onExport = async (format) => {
    setExporting(format);
    try { await exportLeaves({ status, employee: employee || undefined }, format); }
    catch (err) { toast.error(err.message || 'Export failed'); } finally { setExporting(null); }
  };

  const selectedEmp = employees.find((e) => (e.id || e._id) === form.employee);
  const employeeOptions = [{ value: '', label: 'All employees' }, ...employees.map((e) => ({ value: e.id || e._id, label: `${e.name} (${e.employeeCode})` }))];
  const { items, pagination } = data;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="w-full sm:w-44"><Select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} options={[{ value: 'ALL', label: 'All status' }, ...Object.entries(LEAVE_STATUS_META).map(([v, m]) => ({ value: v, label: m.label }))]} /></div>
          <div className="w-full sm:w-56"><Select value={employee} onChange={(e) => { setPage(1); setEmployee(e.target.value); }} options={employeeOptions} /></div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" loading={exporting === 'csv'} disabled={!!exporting} onClick={() => onExport('csv')}><Download className="h-4 w-4" /> CSV</Button>
          <Button variant="outline" loading={exporting === 'xlsx'} disabled={!!exporting} onClick={() => onExport('xlsx')}><Download className="h-4 w-4" /> Excel</Button>
          <Button onClick={() => { setForm({ employee: '', type: 'CASUAL', fromDate: toDateInput(new Date().toISOString()), toDate: toDateInput(new Date().toISOString()), halfDay: false, reason: '' }); setFormOpen(true); }}><Plus className="h-4 w-4" /> Request Leave</Button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? <ListSkeleton /> : items.length === 0 ? <EmptyState icon={CalendarCheck} title="No leave requests" /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">Employee</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">From</th>
                    <th className="px-4 py-3 font-medium">To</th>
                    <th className="px-4 py-3 font-medium">Days</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((l) => {
                    const meta = LEAVE_STATUS_META[l.status];
                    const id = l.id || l._id;
                    return (
                      <tr key={id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                        <td className="px-4 py-3 font-medium">{l.employee?.name}</td>
                        <td className="px-4 py-3"><Badge>{l.type}</Badge></td>
                        <td className="px-4 py-3">{formatDate(l.fromDate)}</td>
                        <td className="px-4 py-3">{formatDate(l.toDate)}</td>
                        <td className="px-4 py-3 tabular-nums">{l.days}</td>
                        <td className="px-4 py-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                        <td className="px-4 py-3">
                          {l.status === 'PENDING' && (
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => decide(l, 'APPROVED')} disabled={busy === id} className="rounded-lg border border-green-500/30 px-2 py-1 text-xs text-green-600 hover:bg-green-500/10 dark:text-green-400"><Check className="inline h-3.5 w-3.5" /> Approve</button>
                              <button onClick={() => decide(l, 'REJECTED')} disabled={busy === id} className="rounded-lg border border-red-500/30 px-2 py-1 text-xs text-red-500 hover:bg-red-500/10"><X className="inline h-3.5 w-3.5" /> Reject</button>
                            </div>
                          )}
                        </td>
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

      <Modal open={formOpen} onClose={() => setFormOpen(false)} size="lg" title="Request Leave"
        footer={<><Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" form="leave-f" loading={saving}>Submit</Button></>}>
        <form id="leave-f" onSubmit={submit} className="grid grid-cols-2 gap-4">
          <Select className="col-span-2" label="Employee *" placeholder="Select" options={employees.map((e) => ({ value: e.id || e._id, label: `${e.name} (${e.employeeCode})` }))} value={form.employee} onChange={(e) => setForm({ ...form, employee: e.target.value })} required />
          <Select label="Type" options={LEAVE_TYPE_OPTIONS} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
          {selectedEmp && form.type !== 'UNPAID' && (
            <p className="self-end pb-2 text-xs text-muted">Balance: {selectedEmp.leaveBalance?.[form.type] ?? 0} day(s)</p>
          )}
          <Input type="date" label="From *" value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value, ...(form.halfDay ? { toDate: e.target.value } : {}) })} required />
          <Input type="date" label="To *" value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} disabled={form.halfDay} required />
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={form.halfDay}
              onChange={(e) => setForm({ ...form, halfDay: e.target.checked, ...(e.target.checked ? { toDate: form.fromDate } : {}) })} />
            Half day <span className="text-xs text-muted">(counts 0.5 against the balance)</span>
          </label>
          <Input className="col-span-2" label="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </form>
      </Modal>
    </div>
  );
}

function AdjustPayslipModal({ payslip, onClose, onSaved }) {
  const toast = useToast();
  const [adjustment, setAdjustment] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (payslip) { setAdjustment(payslip.adjustment || ''); setNote(payslip.adjustmentNote || ''); } }, [payslip]);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await adjustPayslip(payslip.id || payslip._id, { adjustment: Number(adjustment) || 0, adjustmentNote: note }); toast.success('Adjusted'); onSaved(); onClose(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };
  return (
    <Modal open={!!payslip} onClose={onClose} size="md" title={payslip ? `Adjust · ${payslip.payslipNo}` : ''}
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" form="adj-pay-f" loading={saving}>Save</Button></>}>
      <form id="adj-pay-f" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted">Gross pay: <span className="font-medium text-fg">{money(payslip?.grossPay)}</span></p>
        <Input label="Adjustment ₹ (+ bonus, − deduction)" type="number" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} />
        <div>
          <label className="label">Note</label>
          <textarea rows={2} className="input resize-y" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Performance bonus, advance recovery…" />
        </div>
        <p className="text-sm text-muted">New net pay: <span className="font-semibold text-fg">{money(Math.max(0, (payslip?.grossPay || 0) + (Number(adjustment) || 0)))}</span></p>
      </form>
    </Modal>
  );
}

function Payroll() {
  const toast = useToast();
  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 50 } });
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [adjusting, setAdjusting] = useState(null);
  const [paying, setPaying] = useState(null);
  const [payBusy, setPayBusy] = useState(false);
  const [byDept, setByDept] = useState([]);
  const [showByDept, setShowByDept] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try { setData(await listPayslips({ page, limit: 50, month, year, status })); }
    catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, [page, month, year, status, toast]);
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    getPayrollByDepartment(Number(month), Number(year)).then(setByDept).catch(() => setByDept([]));
  }, [month, year]);

  const onGenerate = async () => {
    setGenerating(true);
    try { const r = await generatePayroll(Number(month), Number(year)); toast.success(`Payroll generated for ${r.length} employee(s)`); fetchData(); }
    catch (e) { toast.error(e.message || 'Failed'); } finally { setGenerating(false); }
  };
  const onExport = async (format) => {
    setExporting(format);
    try { await exportPayslips({ month, year, status }, format); }
    catch (err) { toast.error(err.message || 'Export failed'); } finally { setExporting(null); }
  };
  const confirmPay = async () => {
    setPayBusy(true);
    try { await markPayslipPaid(paying.id || paying._id); toast.success('Marked paid'); setPaying(null); fetchData(); }
    catch (e) { toast.error(e.message); } finally { setPayBusy(false); }
  };

  const { items, pagination } = data;
  const totalNet = items.reduce((s, p) => s + p.netPay, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-44"><Select label="Month" options={MONTH_OPTIONS} value={month} onChange={(e) => { setMonth(e.target.value); setPage(1); }} /></div>
        <div className="w-full sm:w-28"><Input label="Year" type="number" value={year} onChange={(e) => { setYear(e.target.value); setPage(1); }} /></div>
        <div className="w-full sm:w-40"><Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={[{ value: 'ALL', label: 'All status' }, ...Object.entries(PAYSLIP_STATUS_META).map(([v, m]) => ({ value: v, label: m.label }))]} /></div>
        <Button onClick={onGenerate} loading={generating}><IndianRupee className="h-4 w-4" /> Generate Payroll</Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" loading={exporting === 'csv'} disabled={!!exporting} onClick={() => onExport('csv')}><Download className="h-4 w-4" /> CSV</Button>
          <Button variant="outline" loading={exporting === 'xlsx'} disabled={!!exporting} onClick={() => onExport('xlsx')}><Download className="h-4 w-4" /> Excel</Button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="!p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted">Total net pay ({MONTH_OPTIONS[Number(month) - 1]?.label} {year})</p>
              <Wallet className="h-4 w-4 text-muted" />
            </div>
            <p className="mt-1 text-2xl font-semibold">{money(totalNet)}</p>
          </Card>
          <Card className="lg:col-span-2 !p-4">
            <button onClick={() => setShowByDept((v) => !v)} className="flex w-full items-center justify-between text-left">
              <span className="flex items-center gap-2 text-sm font-semibold"><Building2 className="h-4 w-4" /> Cost by Department</span>
              <span className="text-xs text-muted">{showByDept ? 'Hide' : 'Show'}</span>
            </button>
            {showByDept && (
              byDept.length === 0 ? <p className="py-4 text-center text-sm text-muted">No payroll data for this period.</p> : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                      <th className="py-2 pr-3 font-medium">Department</th>
                      <th className="py-2 pr-3 text-right font-medium">Staff</th>
                      <th className="py-2 pr-3 text-right font-medium">Gross</th>
                      <th className="py-2 pr-3 text-right font-medium">Net</th>
                      <th className="py-2 text-right font-medium">Paid</th>
                    </tr></thead>
                    <tbody>
                      {byDept.map((d) => (
                        <tr key={d.department} className="border-b border-border/60 last:border-0">
                          <td className="py-2 pr-3 font-medium">{d.department}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{d.employees}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-muted">{money(d.gross)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums font-medium">{money(d.net)}</td>
                          <td className="py-2 text-right tabular-nums text-green-600 dark:text-green-400">{money(d.paid)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </Card>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? <ListSkeleton /> : items.length === 0 ? (
          <EmptyState icon={IndianRupee} title="No payslips for this period" description="Click Generate Payroll to compute pay from attendance." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">Payslip No</th>
                    <th className="px-4 py-3 font-medium">Employee</th>
                    <th className="px-4 py-3 text-right font-medium">Present</th>
                    <th className="px-4 py-3 text-right font-medium">Absent</th>
                    <th className="px-4 py-3 text-right font-medium">Gross</th>
                    <th className="px-4 py-3 text-right font-medium">Adjustment</th>
                    <th className="px-4 py-3 text-right font-medium">Net Pay</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => {
                    const meta = PAYSLIP_STATUS_META[p.status];
                    const id = p.id || p._id;
                    return (
                      <tr key={id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                        <td className="px-4 py-3 font-mono text-xs">{p.payslipNo}</td>
                        <td className="px-4 py-3 font-medium">{p.employee?.name} <span className="font-mono text-xs text-muted">{p.employee?.employeeCode}</span></td>
                        <td className="px-4 py-3 text-right tabular-nums text-green-600 dark:text-green-400">{p.presentDays}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-red-500">{p.absentDays}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{money(p.grossPay)}</td>
                        <td className={'px-4 py-3 text-right tabular-nums ' + (p.adjustment > 0 ? 'text-green-600 dark:text-green-400' : p.adjustment < 0 ? 'text-red-500' : 'text-muted')}>
                          {p.adjustment > 0 ? '+' : ''}{money(p.adjustment)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(p.netPay)}</td>
                        <td className="px-4 py-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => downloadPayslipPdf(id, p.payslipNo).catch((e) => toast.error(e.message || 'PDF failed'))} className="btn-ghost h-8 w-8 !p-0" title="Download payslip"><FileDown className="h-4 w-4" /></button>
                            {p.status !== 'PAID' && (
                              <>
                                <button onClick={() => setAdjusting(p)} className="btn-ghost h-8 !px-2 text-xs" title="Adjust pay"><Pencil className="h-4 w-4" /> Adjust</button>
                                <button onClick={() => setPaying(p)} className="rounded-lg border border-green-500/30 px-2 py-1 text-xs text-green-600 hover:bg-green-500/10 dark:text-green-400"><Check className="inline h-3.5 w-3.5" /> Mark Paid</button>
                              </>
                            )}
                          </div>
                        </td>
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

      <AdjustPayslipModal payslip={adjusting} onClose={() => setAdjusting(null)} onSaved={fetchData} />
      <ConfirmDialog open={!!paying} onClose={() => setPaying(null)} onConfirm={confirmPay} loading={payBusy}
        title="Mark payslip as paid?" confirmLabel="Mark Paid"
        message={paying ? `${paying.employee?.name} — ${money(paying.netPay)} for ${MONTH_OPTIONS[paying.month - 1]?.label} ${paying.year}. This cannot be undone.` : ''} />
    </div>
  );
}

export default function HR() {
  const [tab, setTab] = useState('Employees');
  const [stats, setStats] = useState(null);
  useEffect(() => { getHrStats().then(setStats).catch(() => {}); }, [tab]);

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <h1 className="text-xl font-semibold">Human Resources</h1>
        <p className="mt-0.5 text-sm text-muted">Employees, attendance, leave and payroll management.</p>
      </div>
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="!p-4"><p className="text-xs text-muted">Active Employees</p><p className="mt-1 text-2xl font-semibold">{stats.employees}</p></Card>
          <Card className="!p-4"><p className="text-xs text-muted">Pending Leaves</p><p className={'mt-1 text-2xl font-semibold ' + (stats.pendingLeaves ? 'text-amber-500' : '')}>{stats.pendingLeaves}</p></Card>
          <Card className="!p-4"><p className="text-xs text-muted">On Leave Today</p><p className="mt-1 text-2xl font-semibold">{stats.onLeaveToday}</p></Card>
          <Card className="!p-4"><p className="text-xs text-muted">Unpaid Payslips</p><p className={'mt-1 text-2xl font-semibold ' + (stats.payrollPendingCount ? 'text-amber-500' : '')}>{stats.payrollPendingCount}</p></Card>
        </div>
      )}
      <div className="flex gap-1 border-b border-border">
        {['Employees', 'Attendance', 'Leaves', 'Payroll'].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={'rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ' + (tab === t ? 'border-b-2 border-fg text-fg' : 'text-muted hover:text-fg')}>
            {t === 'Payroll' && <CalendarClock className="mr-1 inline h-3.5 w-3.5" />}{t}
          </button>
        ))}
      </div>
      {tab === 'Employees' && <Employees />}
      {tab === 'Attendance' && <AttendanceTab />}
      {tab === 'Leaves' && <Leaves />}
      {tab === 'Payroll' && <Payroll />}
    </div>
  );
}
