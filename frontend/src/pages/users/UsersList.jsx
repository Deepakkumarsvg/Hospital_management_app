import { useEffect, useState, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { Search, Plus, UserCog, Pencil, Trash2, ShieldCheck } from 'lucide-react';
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
import { listUsers, listRoles, createUser, updateUser, deleteUser } from '../../services/userService.js';
import { formatDate } from '../../utils/constants.js';

function UserForm({ open, onClose, user, roles, onSaved }) {
  const toast = useToast();
  const isEdit = !!user;
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();

  useEffect(() => {
    if (open) reset(isEdit
      ? { name: user.name, phone: user.phone || '', role: user.role, status: user.status, password: '' }
      : { name: '', email: '', phone: '', role: '', password: '', status: 'ACTIVE' });
  }, [open, user, isEdit, reset]);

  const onSubmit = async (values) => {
    const payload = { ...values };
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
        <Input id="password" type="password" label={isEdit ? 'New Password (optional)' : 'Password *'}
          placeholder={isEdit ? 'Leave blank to keep current' : ''} error={errors.password?.message}
          {...register('password', isEdit ? { minLength: { value: 6, message: 'Min 6 characters' } } : { required: 'Password is required', minLength: { value: 6, message: 'Min 6 characters' } })} />
        {isEdit && <Select id="status" label="Status" options={statusOptions} {...register('status')} />}
      </form>
    </Modal>
  );
}

export default function UsersList() {
  const { user: me } = useAuth();
  const toast = useToast();

  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 20 } });
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const debounceRef = useRef();

  useEffect(() => { listRoles().then(setRoles).catch(() => {}); }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listUsers({ page, limit: 20, search, role: roleFilter }));
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

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
          <p className="mt-0.5 text-sm text-muted">{pagination.total} user{pagination.total === 1 ? '' : 's'}</p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> Create User</Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search by name or email…" onChange={onSearchChange} defaultValue={search} />
        </div>
        <div className="w-full sm:w-52">
          <Select value={roleFilter} onChange={(e) => { setPage(1); setRoleFilter(e.target.value); }} options={roleFilterOptions} />
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <Spinner full />
        ) : items.length === 0 ? (
          <EmptyState icon={UserCog} title="No users found" description="Adjust your search or create a user." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Role</th>
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
                      <tr key={id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                        <td className="px-4 py-3 font-medium">
                          {u.name}
                          {isSelf && <span className="ml-2 text-xs text-muted">(you)</span>}
                        </td>
                        <td className="px-4 py-3 text-muted">{u.email}</td>
                        <td className="px-4 py-3">
                          <Badge tone={u.role === 'SUPER_ADMIN' ? 'solid' : 'neutral'}>
                            {u.role === 'SUPER_ADMIN' && <ShieldCheck className="h-3 w-3" />}
                            {u.role.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={u.status === 'ACTIVE' ? 'success' : u.status === 'SUSPENDED' ? 'danger' : 'neutral'}>{u.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted">{u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
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

      <UserForm open={formOpen} onClose={() => setFormOpen(false)} user={editing} roles={roles} onSaved={fetchData} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} loading={deleteLoading}
        title="Delete user?" message={deleting ? `Delete ${deleting.name} (${deleting.email})? This cannot be undone.` : ''} confirmLabel="Delete" />
    </div>
  );
}
