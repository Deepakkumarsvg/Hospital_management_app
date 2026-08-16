import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Stethoscope, Pencil, Trash2, Eye, Download } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Select from '../../components/ui/Select.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import DoctorForm from './DoctorForm.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listDoctors, deleteDoctor, exportDoctors } from '../../services/doctorService.js';
import { activeDepartments } from '../../services/departmentService.js';
import { CAN_MANAGE_ADMIN } from '../../utils/constants.js';

export default function DoctorsList() {
  const { role } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const canManage = CAN_MANAGE_ADMIN.includes(role);

  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 20 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [departments, setDepartments] = useState([]);
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [exporting, setExporting] = useState(null); // 'csv' | 'xlsx' | null
  const debounceRef = useRef();

  useEffect(() => { activeDepartments().then(setDepartments).catch(() => {}); }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listDoctors({ page, limit: 20, search, department: department || undefined, status: 'ALL' }));
    } catch (err) {
      toast.error(err.message || 'Failed to load doctors');
    } finally {
      setLoading(false);
    }
  }, [page, search, department, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onSearchChange = (e) => {
    const v = e.target.value;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); setSearch(v); }, 350);
  };

  const confirmDelete = async () => {
    setDeleteLoading(true);
    try {
      await deleteDoctor(deleting.id || deleting._id);
      toast.success('Doctor deleted');
      setDeleting(null);
      if (data.items.length === 1 && page > 1) setPage((p) => p - 1); else fetchData();
    } catch (err) {
      toast.error(err.message || 'Delete failed');
    } finally {
      setDeleteLoading(false);
    }
  };

  const { items, pagination } = data;
  const deptOptions = [{ value: '', label: 'All departments' }, ...departments.map((d) => ({ value: d.id || d._id, label: d.name }))];

  const onExport = async (format) => {
    setExporting(format);
    try {
      await exportDoctors({ search, department }, format);
    } catch (err) {
      toast.error(err.message || 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="card flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Doctors</h1>
          <p className="mt-0.5 text-sm text-muted">{pagination.total} doctor{pagination.total === 1 ? '' : 's'}</p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <>
              <Button variant="outline" loading={exporting === 'csv'} disabled={!!exporting} onClick={() => onExport('csv')}>
                <Download className="h-4 w-4" /> CSV
              </Button>
              <Button variant="outline" loading={exporting === 'xlsx'} disabled={!!exporting} onClick={() => onExport('xlsx')}>
                <Download className="h-4 w-4" /> Excel
              </Button>
            </>
          )}
          {canManage && (
            <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4" /> Add Doctor
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search by name, specialization, reg no, phone…"
            onChange={onSearchChange} defaultValue={search} />
        </div>
        <div className="w-full sm:w-52">
          <Select value={department} onChange={(e) => { setPage(1); setDepartment(e.target.value); }} options={deptOptions} />
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <Spinner full />
        ) : items.length === 0 ? (
          <EmptyState icon={Stethoscope} title={search ? 'No doctors match' : 'No doctors yet'}
            description={search ? 'Try a different search.' : 'Add your first doctor.'}
            action={canManage && !search ? <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> Add Doctor</Button> : null} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Specialization</th>
                    <th className="px-4 py-3 font-medium">Department</th>
                    <th className="px-4 py-3 font-medium">Reg No</th>
                    <th className="px-4 py-3 font-medium">Fee</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((d) => {
                    const id = d.id || d._id;
                    return (
                      <tr key={id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                        <td className="px-4 py-3">
                          <button onClick={() => navigate(`/doctors/${id}`)} className="font-medium hover:underline">{d.fullName}</button>
                        </td>
                        <td className="px-4 py-3 text-muted">{d.specialization}</td>
                        <td className="px-4 py-3">{d.department?.name || '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs">{d.registrationNo}</td>
                        <td className="px-4 py-3 tabular-nums">₹{d.consultationFee}</td>
                        <td className="px-4 py-3"><Badge tone={d.status === 'ACTIVE' ? 'success' : 'neutral'}>{d.status}</Badge></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => navigate(`/doctors/${id}`)} className="btn-ghost h-8 w-8 !p-0" title="View"><Eye className="h-4 w-4" /></button>
                            {canManage && (
                              <>
                                <button onClick={() => { setEditing(d); setFormOpen(true); }} className="btn-ghost h-8 w-8 !p-0" title="Edit"><Pencil className="h-4 w-4" /></button>
                                <button onClick={() => setDeleting(d)} className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10" title="Delete"><Trash2 className="h-4 w-4" /></button>
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

      <DoctorForm open={formOpen} onClose={() => setFormOpen(false)} doctor={editing} onSaved={fetchData} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} loading={deleteLoading}
        title="Delete doctor?" message={deleting ? `Delete ${deleting.fullName}? This cannot be undone.` : ''} confirmLabel="Delete" />
    </div>
  );
}
