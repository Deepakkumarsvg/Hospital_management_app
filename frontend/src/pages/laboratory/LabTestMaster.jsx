import { useEffect, useState, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Pencil, Trash2, FlaskConical, Search } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listLabTests, createLabTest, updateLabTest, deleteLabTest } from '../../services/labService.js';
import { CAN_MANAGE_ADMIN, SAMPLE_TYPE_OPTIONS, PATIENT_STATUS_OPTIONS } from '../../utils/constants.js';

const STATUS_FILTER = [
  { value: 'ALL', label: 'All status' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

function TestForm({ open, onClose, test, onSaved }) {
  const toast = useToast();
  const isEdit = !!test;
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();
  useEffect(() => { if (open) reset(test || { name: '', code: '', category: 'General', sampleType: 'BLOOD', unit: '', referenceRange: '', price: 0, status: 'ACTIVE' }); }, [open, test, reset]);
  const onSubmit = async (v) => {
    try {
      isEdit ? await updateLabTest(test.id || test._id, v) : await createLabTest(v);
      toast.success(isEdit ? 'Test updated' : 'Test created'); onSaved(); onClose();
    } catch (err) { toast.error(err.message || 'Failed'); }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={isEdit ? 'Edit Test' : 'New Test'}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="lt-f" loading={isSubmitting}>{isEdit ? 'Save' : 'Create'}</Button></>}>
      <form id="lt-f" onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-4" noValidate>
        <Input label="Name *" error={errors.name?.message} {...register('name', { required: 'Required' })} />
        <Input label="Code *" className="uppercase" error={errors.code?.message} {...register('code', { required: 'Required' })} />
        <Input label="Category" {...register('category')} />
        <Select label="Sample Type" options={SAMPLE_TYPE_OPTIONS} {...register('sampleType')} />
        <Input label="Unit" placeholder="g/dL" {...register('unit')} />
        <Input label="Reference Range" placeholder="13-17" {...register('referenceRange')} />
        <Input label="Price ₹" type="number" {...register('price')} />
        {isEdit && <Select label="Status" options={PATIENT_STATUS_OPTIONS} {...register('status')} />}
      </form>
    </Modal>
  );
}

export default function LabTestMaster() {
  const { role } = useAuth();
  const toast = useToast();
  const canManage = CAN_MANAGE_ADMIN.includes(role);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [delLoading, setDelLoading] = useState(false);
  const debounceRef = useRef();

  const load = useCallback(async () => {
    setLoading(true);
    try { setTests(await listLabTests({ search, status })); } catch (err) { toast.error(err.message || 'Failed'); } finally { setLoading(false); }
  }, [search, status, toast]);
  useEffect(() => { load(); }, [load]);

  const onSearchChange = (e) => {
    const v = e.target.value;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(v), 350);
  };

  // Group by category for easier scanning of a large catalogue.
  const groups = tests.reduce((acc, t) => {
    const key = t.category || 'General';
    (acc[key] ||= []).push(t);
    return acc;
  }, {});

  const confirmDelete = async () => {
    setDelLoading(true);
    try { await deleteLabTest(deleting.id || deleting._id); toast.success('Deleted'); setDeleting(null); load(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setDelLoading(false); }
  };

  if (loading) return <Spinner full />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input pl-9" placeholder="Search by name, code or category…" onChange={onSearchChange} defaultValue={search} />
          </div>
          <div className="w-full sm:w-44"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={STATUS_FILTER} /></div>
        </div>
        {canManage && <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> New Test</Button>}
      </div>
      {tests.length === 0 ? (
        <EmptyState icon={FlaskConical} title={search ? 'No tests match your search' : 'No tests'} description={search ? 'Try a different name, code or category.' : 'Add lab tests to the catalogue.'} />
      ) : (
        <div className="space-y-5">
          {Object.entries(groups).map(([category, catTests]) => (
            <div key={category}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{category} <span className="font-normal">({catTests.length})</span></h3>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full min-w-[680px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                      <th className="px-4 py-3 font-medium">Code</th><th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Sample</th>
                      <th className="px-4 py-3 font-medium">Ref. Range</th><th className="px-4 py-3 font-medium">Price</th>
                      <th className="px-4 py-3 font-medium">Status</th>{canManage && <th className="px-4 py-3 text-right font-medium">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {catTests.map((t) => (
                      <tr key={t.id || t._id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                        <td className="px-4 py-3"><Badge>{t.code}</Badge></td>
                        <td className="px-4 py-3 font-medium">{t.name}</td>
                        <td className="px-4 py-3 text-muted">{t.sampleType}</td>
                        <td className="px-4 py-3 text-muted">{t.referenceRange || '—'} {t.unit}</td>
                        <td className="px-4 py-3 tabular-nums">₹{t.price}</td>
                        <td className="px-4 py-3"><Badge tone={t.status === 'ACTIVE' ? 'success' : 'neutral'}>{t.status}</Badge></td>
                        {canManage && (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => { setEditing(t); setFormOpen(true); }} className="btn-ghost h-8 w-8 !p-0"><Pencil className="h-4 w-4" /></button>
                              <button onClick={() => setDeleting(t)} className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
      <TestForm open={formOpen} onClose={() => setFormOpen(false)} test={editing} onSaved={load} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} loading={delLoading}
        title="Delete test?" message={deleting ? `Delete ${deleting.name}?` : ''} confirmLabel="Delete" />
    </div>
  );
}
