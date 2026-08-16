import { useEffect, useState, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Pencil, Trash2, Building2, Search, Download, Stethoscope } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  listDepartments, createDepartment, updateDepartment, deleteDepartment, exportDepartments,
} from '../../services/departmentService.js';
import { CAN_MANAGE_ADMIN, PATIENT_STATUS_OPTIONS } from '../../utils/constants.js';

const STATUS_FILTER = [
  { value: 'ALL', label: 'All status' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

function DepartmentForm({ open, onClose, department, onSaved }) {
  const toast = useToast();
  const isEdit = !!department;
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();

  useEffect(() => {
    if (open) reset(department || { name: '', code: '', description: '', status: 'ACTIVE' });
  }, [open, department, reset]);

  const onSubmit = async (values) => {
    try {
      isEdit
        ? await updateDepartment(department.id || department._id, values)
        : await createDepartment(values);
      toast.success(isEdit ? 'Department updated' : 'Department created');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Could not save');
    }
  };

  return (
    <Modal
      open={open} onClose={onClose} size="md"
      title={isEdit ? 'Edit Department' : 'New Department'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" form="dept-form" loading={isSubmitting}>{isEdit ? 'Save' : 'Create'}</Button>
        </>
      }
    >
      <form id="dept-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input id="name" label="Name *" placeholder="Cardiology"
          error={errors.name?.message} {...register('name', { required: 'Name is required' })} />
        <Input id="code" label="Code *" placeholder="CARD" className="uppercase"
          error={errors.code?.message} {...register('code', { required: 'Code is required' })} />
        <div>
          <label htmlFor="description" className="label">Description</label>
          <textarea id="description" rows={2} className="input resize-y" {...register('description')} />
        </div>
        {isEdit && <Select id="status" label="Status" options={PATIENT_STATUS_OPTIONS} {...register('status')} />}
      </form>
    </Modal>
  );
}

export default function Departments() {
  const { role } = useAuth();
  const toast = useToast();
  const canManage = CAN_MANAGE_ADMIN.includes(role);

  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 20 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [exporting, setExporting] = useState(null); // 'csv' | 'xlsx' | null
  const debounceRef = useRef();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listDepartments({ page, limit: 20, search, status }));
    } catch (err) {
      toast.error(err.message || 'Failed to load departments');
    } finally {
      setLoading(false);
    }
  }, [page, search, status, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onSearchChange = (e) => {
    const v = e.target.value;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); setSearch(v); }, 350);
  };

  const confirmDelete = async () => {
    setDeleteLoading(true);
    try {
      await deleteDepartment(deleting.id || deleting._id);
      toast.success('Department deleted');
      setDeleting(null);
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Delete failed');
    } finally {
      setDeleteLoading(false);
    }
  };

  const onExport = async (format) => {
    setExporting(format);
    try {
      await exportDepartments({ search, status }, format);
    } catch (err) {
      toast.error(err.message || 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  const { items, pagination } = data;

  return (
    <div className="space-y-5">
      <div className="card flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Departments</h1>
          <p className="mt-0.5 text-sm text-muted">{pagination.total} department{pagination.total === 1 ? '' : 's'}</p>
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
              <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4" /> New Department
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search by name or code…" onChange={onSearchChange} defaultValue={search} />
        </div>
        <div className="w-full sm:w-44">
          <Select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} options={STATUS_FILTER} />
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <ListSkeleton />
        ) : items.length === 0 ? (
          <EmptyState icon={Building2} title={search ? 'No departments match your search' : 'No departments'}
            description={search ? 'Try a different name or code.' : 'Create a department to get started.'} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">Code</th>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium">Doctors</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    {canManage && <th className="px-4 py-3 text-right font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((d) => (
                    <tr key={d.id || d._id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                      <td className="px-4 py-3"><Badge>{d.code}</Badge></td>
                      <td className="px-4 py-3 font-medium">{d.name}</td>
                      <td className="px-4 py-3 text-muted">{d.description || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-muted"><Stethoscope className="h-3.5 w-3.5" /> {d.doctorCount ?? 0}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={d.status === 'ACTIVE' ? 'success' : 'neutral'}>{d.status}</Badge>
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => { setEditing(d); setFormOpen(true); }}
                              className="btn-ghost h-8 w-8 !p-0" title="Edit"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => setDeleting(d)}
                              className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10" title="Delete">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} limit={pagination.limit} onChange={setPage} />
          </>
        )}
      </div>

      <DepartmentForm open={formOpen} onClose={() => setFormOpen(false)} department={editing} onSaved={fetchData} />
      <ConfirmDialog
        open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} loading={deleteLoading}
        title="Delete department?"
        message={deleting ? `Delete ${deleting.name} (${deleting.code})? This cannot be undone.` : ''}
        confirmLabel="Delete"
      />
    </div>
  );
}
