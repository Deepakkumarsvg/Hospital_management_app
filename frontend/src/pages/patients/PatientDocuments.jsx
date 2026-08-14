import { useEffect, useRef, useState, useCallback } from 'react';
import { Upload, FileText, Download, Trash2, File } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Select from '../../components/ui/Select.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  listPatientDocuments, uploadPatientDocument, deletePatientDocument, downloadPatientDocument,
} from '../../services/documentService.js';
import { CAN_EDIT_PATIENTS, formatDate } from '../../utils/constants.js';

const CATEGORIES = [
  { value: 'ID_PROOF', label: 'ID Proof' },
  { value: 'LAB_REPORT', label: 'Lab Report' },
  { value: 'PRESCRIPTION', label: 'Prescription' },
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'RADIOLOGY', label: 'Radiology' },
  { value: 'DISCHARGE', label: 'Discharge Summary' },
  { value: 'OTHER', label: 'Other' },
];
const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function PatientDocuments({ patientId }) {
  const { role } = useAuth();
  const toast = useToast();
  const canEdit = CAN_EDIT_PATIENTS.includes(role);
  const fileRef = useRef(null);

  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('OTHER');
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDocs(await listPatientDocuments(patientId));
    } catch (err) {
      toast.error(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [patientId, toast]);

  useEffect(() => { load(); }, [load]);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting same file
    if (!file) return;
    setUploading(true);
    try {
      await uploadPatientDocument(patientId, file, category);
      toast.success('Document uploaded');
      load();
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const onDownload = async (doc) => {
    try {
      await downloadPatientDocument(patientId, doc);
    } catch {
      toast.error('Could not download file');
    }
  };

  const confirmDelete = async () => {
    setDeleteLoading(true);
    try {
      await deletePatientDocument(patientId, deleting.id || deleting._id);
      toast.success('Document deleted');
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err.message || 'Delete failed');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-surface p-4 sm:flex-row sm:items-end">
          <div className="w-full sm:w-56">
            <Select label="Category" options={CATEGORIES} value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={onPick} />
          <Button onClick={() => fileRef.current?.click()} loading={uploading}>
            <Upload className="h-4 w-4" /> Upload Document
          </Button>
          <p className="text-xs text-muted sm:ml-auto">PDF, JPG, PNG, WEBP · max 5 MB</p>
        </div>
      )}

      {loading ? (
        <Spinner full />
      ) : docs.length === 0 ? (
        <EmptyState icon={FileText} title="No documents" description={canEdit ? 'Upload the first document above.' : 'No documents on file.'} />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {docs.map((d) => (
            <div key={d.id || d._id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface">
                <File className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{d.originalName}</p>
                <p className="text-xs text-muted">
                  {humanSize(d.size)} · {formatDate(d.createdAt)}{d.uploadedBy ? ` · ${d.uploadedBy.name}` : ''}
                </p>
              </div>
              <Badge>{CAT_LABEL[d.category] || d.category}</Badge>
              <button onClick={() => onDownload(d)} className="btn-ghost h-8 w-8 !p-0" title="Download"><Download className="h-4 w-4" /></button>
              {canEdit && (
                <button onClick={() => setDeleting(d)} className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10" title="Delete"><Trash2 className="h-4 w-4" /></button>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} loading={deleteLoading}
        title="Delete document?" message={deleting ? `Delete "${deleting.originalName}"? This cannot be undone.` : ''} confirmLabel="Delete" />
    </div>
  );
}
