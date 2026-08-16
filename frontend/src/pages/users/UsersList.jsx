import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Search, Plus, UserCog, Pencil, Trash2, ShieldCheck, Eye, Download, Users, UserCheck, UserX, History } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listUsers, listRoles, getUser, getUserStats, createUser, updateUser, deleteUser } from '../../services/userService.js';
import { activeDepartments } from '../../services/departmentService.js';
import { formatDate, formatDateTime } from '../../utils/constants.js';

function toCsv(rows, headers) {
  const lines = [headers.map((h) => h.label).join(',')];
  for (const row of rows) lines.push(headers.map((h) => `"${String(h.value(row) ?? '').replace(/"/g, '""')}"`).join(','));
  return lines.join('\n');
}
function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function Avatar({ name, role }) {
  const initials = (name || '?').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span className={
      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ' +
      (role === 'SUPER_ADMIN' ? 'bg-accent text-accent-fg' : 'border border-border bg-surface text-fg')
    }>
      {initials}
    </span>
  );
}

function Stat({ label, value, icon: Icon }) {
  return (
    <Card className="!p-4 flex items-center justify-between">
      <div><p className="text-xs text-muted">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface"><Icon className="h-4 w-4" /></span>
    </Card>
  );
}

function UserForm({ open, onClose, user, roles, departments, onSaved }) {
  const toast = useToast();
  const isEdit = !!user;
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();

  useEffect(() => {
    if (open) reset(isEdit
      ? { name: user.name, phone: user.phone || '', role: user.role, department: user.department?.id || user.department?._id || '', status: user.status, password: '' }
      : { name: '', email: '', phone: '', role: '', department: '', password: '', status: 'ACTIVE' });
  }, [open, user, isEdit, reset]);

  const onSubmit = async (values) => {
    const payload = { ...values, department: values.department || null };
    if (isEdit && !payload.password) delete payload.password; // don't overwrite
    try {
      isEdit ? await updateUser(user.id || user._id, payload) : await createUser(payload);
      toast.success(isEdit ? 'User updated' : 'User created');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Could not save user');
    }
  };

  const roleOptions = roles.map((r) => ({ value: r.name, label: r.name.replace(/_/g, ' ') }));
  const deptOptions = departments.map((d) => ({ value: d.id || d._id, label: d.name }));
  const statusOptions = ['ACTIVE', 'INACTIVE', 'SUSPENDED'].map((s) => ({ value: s, label: s }));

  return (
    <Modal
      open={open} onClose={onClose} size="lg"
      title={isEdit ? `Edit ${user.name}` : 'Create User'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" form="user-form" loading={isSubmitting}>{isEdit ? 'Save' : 'Create'}</Button>
        </>
      }
    >
      <form id="user-form" onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Input id="name" label="Name *" error={errors.name?.message}
          {...register('name', { required: 'Name is required' })} />
        {!isEdit ? (
          <Input id="email" type="email" label="Email *" error={errors.email?.message}
            {...register('email', { required: 'Email is required', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email' } })} />
        ) : (
          <Input id="email" label="Email" value={user.email} disabled />
        )}
        <Input id="phone" label="Phone" {...register('phone')} />
        <Select id="role" label="Role *" placeholder="Select role" options={roleOptions} error={errors.role?.message}
          {...register('role', { required: 'Role is required' })} />
        <Select id="department" label="Department" placeholder="None" options={deptOptions} {...register('department')} />
        <Input id="password" type="password" label={isEdit ? 'New Password (optional)' : 'Password *'}
          placeholder={isEdit ? 'Leave blank to keep current' : ''} error={errors.password?.message}
          {...register('password', isEdit ? { minLength: { value: 6, message: 'Min 6 characters' } } : { required: 'Password is required', minLength: { value: 6, message: 'Min 6 characters' } })} />
        {isEdit && <Select id="status" label="Status" options={statusOptions} {...register('status')} />}
      </form>
    </Modal>
  );
}

function UserDetailModal({ userId, onClose }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  useEffect(() => {
    if (!userId) { setUser(null); return; }
    getUser(userId).then(setUser).catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return (
    <Modal open={!!userId} onClose={onClose} size="md" title={user ? user.name : 'User'}>
      {!user ? <Spinner /> : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} role={user.role} />
            <div>
              <p className="font-medium">{user.name}</p>
              <p className="text-sm text-muted">{user.email}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-xs text-muted">Role</p><p className="mt-0.5 font-medium">{user.role.replace(/_/g, ' ')}</p></div>
            <div><p className="text-xs text-muted">Status</p><p className="mt-0.5"><Badge tone={user.status === 'ACTIVE' ? 'success' : user.status === 'SUSPENDED' ? 'danger' : 'neutral'}>{user.status}</Badge></p></div>
            <div><p className="text-xs text-muted">Department</p><p className="mt-0.5 font-medium">{user.department?.name || '—'}</p></div>
            <div><p className="text-xs text-muted">Phone</p><p className="mt-0.5 font-medium">{user.phone || '—'}</p></div>
            <div><p className="text-xs text-muted">Last Login</p><p className="mt-0.5 font-medium">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}</p></div>
            <div><p className="text-xs text-muted">Account Created</p><p className="mt-0.5 font-medium">{formatDate(user.createdAt)}</p></div>
          </div>

          {user.role === 'DOCTOR' && (
            user.linkedDoctor ? (
              <button onClick={() => navigate(`/doctors/${user.linkedDoctor.id || user.linkedDoctor._id}`)}
                className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-surface">
                <span>Linked Doctor Profile: <span className="font-medium">Dr. {user.linkedDoctor.fullName}</span> <span className="text-muted">· {user.linkedDoctor.specialization}</span></span>
                <Badge tone="success">Linked</Badge>
              </button>
            ) : (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                Not linked to a Doctor profile — this login won't see a personal doctor dashboard. Link it under Doctors → Edit → Linked Login.
              </div>
            )
          )}
          {user.role === 'PATIENT' && (
            user.patient ? (
              <button onClick={() => navigate(`/patients/${user.patient.id || user.patient._id}`)}
                className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-surface">
                <span>Linked Patient Profile: <span className="font-medium">{user.patient.firstName} {user.patient.lastName}</span> <span className="font-mono text-xs text-muted">{user.patient.uhid}</span></span>
                <Badge tone="success">Linked</Badge>
              </button>
            ) : (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                Not linked to a Patient profile — this portal login can't see any medical records.
              </div>
            )
          )}

          <button
            onClick={() => navigate(`/audit-logs?search=${encodeURIComponent(user.name)}`)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2 text-sm font-medium hover:bg-surface"
          >
            <History className="h-4 w-4" /> View Activity Log
          </button>
        </div>
      )}
    </Modal>
  );
}

export default function UsersList() {
  const { user: me } = useAuth();
  const toast = useToast();

  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 20 } });
  const [roles, setRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const debounceRef = useRef();

  useEffect(() => {
    listRoles().then(setRoles).catch(() => {});
    activeDepartments().then(setDepartments).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listUsers({ page, limit: 20, search, role: roleFilter }));
      getUserStats().then(setStats).catch(() => {});
    } catch (err) {
      toast.error(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onSearchChange = (e) => {
    const v = e.target.value;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); setSearch(v); }, 350);
  };

  const confirmDelete = async () => {
    setDeleteLoading(true);
    try {
      await deleteUser(deleting.id || deleting._id);
      toast.success('User deleted');
      setDeleting(null);
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Delete failed');
    } finally {
      setDeleteLoading(false);
    }
  };

  const { items, pagination } = data;
  const roleFilterOptions = [{ value: 'ALL', label: 'All roles' }, ...roles.map((r) => ({ value: r.name, label: r.name.replace(/_/g, ' ') }))];
  const myId = me?.id || me?._id;

  const exportCsv = () => downloadCsv('users.csv', toCsv(items, [
    { label: 'Name', value: (u) => u.name },
    { label: 'Email', value: (u) => u.email },
    { label: 'Role', value: (u) => u.role },
    { label: 'Department', value: (u) => u.department?.name || '' },
    { label: 'Status', value: (u) => u.status },
    { label: 'Last Login', value: (u) => (u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never') },
  ]));

  return (
    <div className="space-y-5">
      <div className="card flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
          <p className="mt-0.5 text-sm text-muted">{pagination.total} user{pagination.total === 1 ? '' : 's'}</p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> Create User</Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Total Users" value={stats.total} icon={Users} />
          <Stat label="Active" value={stats.active} icon={UserCheck} />
          <Stat label="Suspended" value={stats.suspended} icon={UserX} />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search by name or email…" onChange={onSearchChange} defaultValue={search} />
        </div>
        <div className="w-full sm:w-52">
          <Select value={roleFilter} onChange={(e) => { setPage(1); setRoleFilter(e.target.value); }} options={roleFilterOptions} />
        </div>
        {items.length > 0 && <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button>}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <Spinner full />
        ) : items.length === 0 ? (
          <EmptyState icon={UserCog} title="No users found" description="Adjust your search or create a user." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Department</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Last Login</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((u) => {
                    const id = u.id || u._id;
                    const isSelf = id === myId;
                    return (
                      <tr key={id} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface" onClick={() => setDetailId(id)}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={u.name} role={u.role} />
                            <span className="font-medium">
                              {u.name}
                              {isSelf && <span className="ml-2 text-xs text-muted">(you)</span>}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted">{u.email}</td>
                        <td className="px-4 py-3">
                          <Badge tone={u.role === 'SUPER_ADMIN' ? 'solid' : 'neutral'}>
                            {u.role === 'SUPER_ADMIN' && <ShieldCheck className="h-3 w-3" />}
                            {u.role.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted">{u.department?.name || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge tone={u.status === 'ACTIVE' ? 'success' : u.status === 'SUSPENDED' ? 'danger' : 'neutral'}>{u.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted">{u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}</td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setDetailId(id)} className="btn-ghost h-8 w-8 !p-0" title="View"><Eye className="h-4 w-4" /></button>
                            <button onClick={() => { setEditing(u); setFormOpen(true); }} className="btn-ghost h-8 w-8 !p-0" title="Edit"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => setDeleting(u)} disabled={isSelf}
                              className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10 disabled:opacity-30"
                              title={isSelf ? "You can't delete yourself" : 'Delete'}>
                              <Trash2 className="h-4 w-4" />
                            </button>
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

      <UserForm open={formOpen} onClose={() => setFormOpen(false)} user={editing} roles={roles} departments={departments} onSaved={fetchData} />
      <UserDetailModal userId={detailId} onClose={() => setDetailId(null)} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} loading={deleteLoading}
        title="Delete user?" message={deleting ? `Delete ${deleting.name} (${deleting.email})? This cannot be undone.` : ''} confirmLabel="Delete" />
    </div>
  );
}
