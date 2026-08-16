import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Plus, Users, Pencil, Trash2, Eye, RotateCcw, Download,
} from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Select from '../../components/ui/Select.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import PatientForm from './PatientForm.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listPatients, deletePatient, exportPatients } from '../../services/patientService.js';
import { CAN_EDIT_PATIENTS, CAN_DELETE_PATIENTS, formatDate } from '../../utils/constants.js';

const STATUS_FILTER = [
  { value: 'ALL', label: 'All status' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

export default function PatientsList() {
  const { role } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const canEdit = CAN_EDIT_PATIENTS.includes(role);
  const canDelete = CAN_DELETE_PATIENTS.includes(role);

  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 20 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const debounceRef = useRef();
  const searchInputRef = useRef(null);
  const [exporting, setExporting] = useState(null); // 'csv' | 'xlsx' | null

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPatients({ page, limit: 20, search, status });
      setData(res);
    } catch (err) {
      toast.error(err.message || 'Failed to load patients');
    } finally {
      setLoading(false);
    }
  }, [page, search, status, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Debounce search input → reset to page 1.
  const onSearchChange = (e) => {
    const val = e.target.value;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(val);
    }, 350);
  };

  const resetSearch = () => {
    clearTimeout(debounceRef.current);
    if (searchInputRef.current) searchInputRef.current.value = '';
    setPage(1);
    setSearch('');
    setStatus('ALL');
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (p) => {
    setEditing(p);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    setDeleteLoading(true);
    try {
      await deletePatient(deleting.id || deleting._id);
      toast.success('Patient deleted');
      setDeleting(null);
      // If we removed the last item on a page, step back.
      if (data.items.length === 1 && page > 1) setPage((p) => p - 1);
      else fetchData();
    } catch (err) {
      toast.error(err.message || 'Delete failed');
    } finally {
      setDeleteLoading(false);
    }
  };

  const { items, pagination } = data;

  const onExport = async (format) => {
    setExporting(format);
    try {
      await exportPatients({ search, status }, format);
    } catch (err) {
      toast.error(err.message || 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="card flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Patients</h1>
          <p className="mt-0.5 text-sm text-muted">
            {pagination.total} registered patient{pagination.total === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" loading={exporting === 'csv'} disabled={!!exporting} onClick={() => onExport('csv')}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" loading={exporting === 'xlsx'} disabled={!!exporting} onClick={() => onExport('xlsx')}>
            <Download className="h-4 w-4" /> Excel
          </Button>
          {canEdit && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Register Patient
            </Button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            ref={searchInputRef}
            className="input pl-9"
            placeholder="Search by UHID, name, phone or email…"
            onChange={onSearchChange}
            defaultValue={search}
          />
        </div>
        <div className="w-full sm:w-44">
          <Select
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
            options={STATUS_FILTER}
          />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <ListSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Users}
            title={search ? 'No patients match your search' : 'No patients yet'}
            description={search ? 'Try a different name, UHID or phone number.' : 'Register your first patient to get started.'}
            action={
              canEdit && !search ? (
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" /> Register Patient
                </Button>
              ) : search ? (
                <Button variant="outline" onClick={resetSearch}>
                  <RotateCcw className="h-4 w-4" /> Reset
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">UHID</th>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Gender / Age</th>
                    <th className="px-4 py-3 font-medium">Phone</th>
                    <th className="px-4 py-3 font-medium">Blood</th>
                    <th className="px-4 py-3 font-medium">Registered</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => {
                    const id = p.id || p._id;
                    return (
                      <tr
                        key={id}
                        className="border-b border-border/60 last:border-0 hover:bg-surface"
                      >
                        <td className="px-4 py-3">
                          <button
                            onClick={() => navigate(`/patients/${id}`)}
                            className="font-mono text-xs font-medium text-fg hover:underline"
                          >
                            {p.uhid}
                          </button>
                        </td>
                        <td className="px-4 py-3 font-medium">{p.fullName}</td>
                        <td className="px-4 py-3 text-muted">
                          {p.gender?.[0] + p.gender?.slice(1).toLowerCase()} · {p.age ?? '—'}y
                        </td>
                        <td className="px-4 py-3 tabular-nums">{p.phone}</td>
                        <td className="px-4 py-3">
                          {p.bloodGroup && p.bloodGroup !== 'UNKNOWN' ? (
                            <Badge>{p.bloodGroup}</Badge>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted">{formatDate(p.createdAt)}</td>
                        <td className="px-4 py-3">
                          <Badge tone={p.status === 'ACTIVE' ? 'success' : 'neutral'}>{p.status}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => navigate(`/patients/${id}`)}
                              className="btn-ghost h-8 w-8 !p-0" title="View" aria-label="View patient"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            {canEdit && (
                              <button
                                onClick={() => openEdit(p)}
                                className="btn-ghost h-8 w-8 !p-0" title="Edit" aria-label="Edit patient"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => setDeleting(p)}
                                className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10"
                                title="Delete" aria-label="Delete patient"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              limit={pagination.limit}
              onChange={setPage}
            />
          </>
        )}
      </div>

      <PatientForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        patient={editing}
        onSaved={fetchData}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={deleteLoading}
        title="Delete patient?"
        message={
          deleting
            ? `This will permanently remove ${deleting.fullName} (${deleting.uhid}). This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
      />
    </div>
  );
}
