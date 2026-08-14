import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Pencil, Trash2, Scan } from 'lucide-react';
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
import { listRadTests, createRadTest, updateRadTest, deleteRadTest } from '../../services/radiologyService.js';
import { CAN_MANAGE_ADMIN, MODALITY_OPTIONS, PATIENT_STATUS_OPTIONS } from '../../utils/constants.js';

function TestForm({ open, onClose, test, onSaved }) {
  const toast = useToast();
  const isEdit = !!test;
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();
  useEffect(() => { if (open) reset(test || { name: '', code: '', modality: 'XRAY', bodyPart: '', price: 0, status: 'ACTIVE' }); }, [open, test, reset]);
  const onSubmit = async (v) => {
    try { isEdit ? await updateRadTest(test.id || test._id, v) : await createRadTest(v); toast.success(isEdit ? 'Updated' : 'Created'); onSaved(); onClose(); }
    catch (err) { toast.error(err.message || 'Failed'); }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={isEdit ? 'Edit Test' : 'New Test'}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="rt-f" loading={isSubmitting}>{isEdit ? 'Save' : 'Create'}</Button></>}>
      <form id="rt-f" onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-4" noValidate>
        <Input label="Name *" error={errors.name?.message} {...register('name', { required: 'Required' })} />
        <Input label="Code *" className="uppercase" error={errors.code?.message} {...register('code', { required: 'Required' })} />
        <Select label="Modality" options={MODALITY_OPTIONS} {...register('modality')} />
        <Input label="Body Part" {...register('bodyPart')} />
        <Input label="Price ₹" type="number" {...register('price')} />
        {isEdit && <Select label="Status" options={PATIENT_STATUS_OPTIONS} {...register('status')} />}
      </form>
    </Modal>
  );
}

export default function RadTestMaster() {
  const { role } = useAuth();
  const toast = useToast();
  const canManage = CAN_MANAGE_ADMIN.includes(role);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [delLoading, setDelLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setTests(await listRadTests()); } catch (err) { toast.error(err.message || 'Failed'); } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const confirmDelete = async () => {
    setDelLoading(true);
    try { await deleteRadTest(deleting.id || deleting._id); toast.success('Deleted'); setDeleting(null); load(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setDelLoading(false); }
  };
  if (loading) return <Spinner full />;

  return (
    <div className="space-y-4">
      {canManage && <div className="flex justify-end"><Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> New Test</Button></div>}
      {tests.length === 0 ? (
        <EmptyState icon={Scan} title="No tests" description="Add radiology investigations to the catalogue." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Code</th><th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Modality</th><th className="px-4 py-3 font-medium">Body Part</th>
              <th className="px-4 py-3 font-medium">Price</th><th className="px-4 py-3 font-medium">Status</th>
              {canManage && <th className="px-4 py-3 text-right font-medium">Actions</th>}
            </tr></thead>
            <tbody>
              {tests.map((t) => (
                <tr key={t.id || t._id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                  <td className="px-4 py-3"><Badge>{t.code}</Badge></td>
                  <td className="px-4 py-3 font-medium">{t.name}</td>
                  <td className="px-4 py-3"><Badge tone="neutral">{t.modality}</Badge></td>
                  <td className="px-4 py-3 text-muted">{t.bodyPart || '—'}</td>
                  <td className="px-4 py-3 tabular-nums">₹{t.price}</td>
                  <td className="px-4 py-3"><Badge tone={t.status === 'ACTIVE' ? 'success' : 'neutral'}>{t.status}</Badge></td>
                  {canManage && (
                    <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setEditing(t); setFormOpen(true); }} className="btn-ghost h-8 w-8 !p-0"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => setDeleting(t)} className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                    </div></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <TestForm open={formOpen} onClose={() => setFormOpen(false)} test={editing} onSaved={load} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} loading={delLoading}
        title="Delete test?" message={deleting ? `Delete ${deleting.name}?` : ''} confirmLabel="Delete" />
    </div>
  );
}
