import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getEmployee } from '../../services/hrService.js';
import { LEAVE_STATUS_META, PAYSLIP_STATUS_META, MONTH_OPTIONS, formatDate, money } from '../../utils/constants.js';

const ATT_TONE = { PRESENT: 'success', ABSENT: 'danger', HALF_DAY: 'warning', LEAVE: 'warning' };

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default function EmployeeDetailModal({ employeeId, onClose }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('Attendance');

  useEffect(() => {
    if (!employeeId) return;
    setLoading(true); setData(null); setTab('Attendance');
    getEmployee(employeeId)
      .then(setData)
      .catch((err) => toast.error(err.message || 'Failed'))
      .finally(() => setLoading(false));
  }, [employeeId, toast]);

  const e = data?.employee;

  return (
    <Modal open={!!employeeId} onClose={onClose} size="xl" title={e ? `${e.name} · ${e.employeeCode}` : 'Employee'}>
      {loading ? <ListSkeleton rows={4} /> : !data ? null : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><p className="text-xs text-muted">Designation</p><p className="mt-0.5">{e.designation || '—'}</p></div>
            <div><p className="text-xs text-muted">Department</p><p className="mt-0.5">{e.department?.name || '—'}</p></div>
            <div><p className="text-xs text-muted">Shift</p><p className="mt-0.5">{e.shift}</p></div>
            <div><p className="text-xs text-muted">Status</p><p className="mt-0.5"><Badge tone={e.status === 'ACTIVE' ? 'success' : 'neutral'}>{e.status}</Badge></p></div>
            <div><p className="text-xs text-muted">Phone</p><p className="mt-0.5">{e.phone || '—'}</p></div>
            <div><p className="text-xs text-muted">Email</p><p className="mt-0.5 truncate">{e.email || '—'}</p></div>
            <div><p className="text-xs text-muted">Joined</p><p className="mt-0.5">{formatDate(e.joiningDate)}</p></div>
            <div><p className="text-xs text-muted">Salary</p><p className="mt-0.5 tabular-nums">{money(e.salary)}</p></div>
            {e.exitDate && (
              <div className="col-span-2 sm:col-span-4">
                <p className="text-xs text-muted">Exited</p>
                <p className="mt-0.5">{formatDate(e.exitDate)}{e.exitReason ? ` — ${e.exitReason}` : ''}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Leave Balance (C/S/E)" value={`${e.leaveBalance?.CASUAL ?? 0}/${e.leaveBalance?.SICK ?? 0}/${e.leaveBalance?.EARNED ?? 0}`} />
            <Stat label="Leaves Taken" value={data.stats.leavesTaken} />
            <Stat label="Payslips Paid" value={data.stats.payslipsPaid} />
            <Stat label="Lifetime Paid" value={money(data.stats.lifetimePaid)} />
          </div>

          <div className="flex gap-1 border-b border-border">
            {['Attendance', 'Leaves', 'Payslips'].map((t) => (
              <button key={t} onClick={() => setTab(t)} className={'rounded-t-lg px-3 py-1.5 text-xs font-medium transition-colors ' + (tab === t ? 'border-b-2 border-fg text-fg' : 'text-muted hover:text-fg')}>{t}</button>
            ))}
          </div>

          <div className="max-h-72 overflow-auto rounded-lg border border-border">
            {tab === 'Attendance' && (
              data.attendance.length === 0 ? <p className="py-8 text-center text-sm text-muted">No attendance records.</p> : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-elevated"><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">In</th><th className="px-3 py-2 font-medium">Out</th>
                    <th className="px-3 py-2 text-right font-medium">Hours</th>
                  </tr></thead>
                  <tbody>
                    {data.attendance.map((a) => (
                      <tr key={a.id || a._id} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2">{formatDate(a.date)}</td>
                        <td className="px-3 py-2"><Badge tone={ATT_TONE[a.status] || 'neutral'}>{a.status}</Badge></td>
                        <td className="px-3 py-2 text-muted">{a.checkIn || '—'}</td>
                        <td className="px-3 py-2 text-muted">{a.checkOut || '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{a.hoursWorked != null ? `${a.hoursWorked}h` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
            {tab === 'Leaves' && (
              data.leaves.length === 0 ? <p className="py-8 text-center text-sm text-muted">No leave requests.</p> : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-elevated"><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-medium">Type</th><th className="px-3 py-2 font-medium">From</th>
                    <th className="px-3 py-2 font-medium">To</th><th className="px-3 py-2 font-medium">Days</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr></thead>
                  <tbody>
                    {data.leaves.map((l) => {
                      const meta = LEAVE_STATUS_META[l.status];
                      return (
                        <tr key={l.id || l._id} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-2"><Badge>{l.type}</Badge></td>
                          <td className="px-3 py-2">{formatDate(l.fromDate)}</td>
                          <td className="px-3 py-2">{formatDate(l.toDate)}</td>
                          <td className="px-3 py-2 tabular-nums">{l.days}</td>
                          <td className="px-3 py-2"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            )}
            {tab === 'Payslips' && (
              data.payslips.length === 0 ? <p className="py-8 text-center text-sm text-muted">No payslips yet.</p> : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-elevated"><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-medium">Payslip No</th><th className="px-3 py-2 font-medium">Period</th>
                    <th className="px-3 py-2 text-right font-medium">Net Pay</th><th className="px-3 py-2 font-medium">Status</th>
                  </tr></thead>
                  <tbody>
                    {data.payslips.map((p) => {
                      const meta = PAYSLIP_STATUS_META[p.status];
                      return (
                        <tr key={p.id || p._id} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-2 font-mono text-xs">{p.payslipNo}</td>
                          <td className="px-3 py-2">{MONTH_OPTIONS[p.month - 1]?.label} {p.year}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{money(p.netPay)}</td>
                          <td className="px-3 py-2"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
