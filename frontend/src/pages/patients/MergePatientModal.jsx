import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from '../../components/ui/Modal.jsx';
import Button from '../../components/ui/Button.jsx';
import PatientPicker from '../appointments/PatientPicker.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { mergePatients } from '../../services/patientService.js';

// Folds a duplicate patient profile into the current one. All of the
// duplicate's clinical/financial records are moved over, then it's deleted.
export default function MergePatientModal({ open, onClose, patient, onMerged }) {
  const toast = useToast();
  const [duplicate, setDuplicate] = useState(null);
  const [saving, setSaving] = useState(false);

  const close = () => { setDuplicate(null); onClose(); };

  const confirm = async () => {
    setSaving(true);
    try {
      const { moved } = await mergePatients(patient.id || patient._id, duplicate.id || duplicate._id);
      const movedTotal = Object.values(moved || {}).reduce((a, b) => a + b, 0);
      toast.success(movedTotal > 0 ? `Merged — ${movedTotal} record(s) moved over` : 'Merged — no records needed moving');
      onMerged?.();
      close();
    } catch (err) {
      toast.error(err.message || 'Merge failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open} onClose={close} size="lg" title="Merge duplicate patient"
      description={`Fold another patient's records into ${patient?.fullName} (${patient?.uhid}).`}
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={saving}>Cancel</Button>
          <Button onClick={confirm} loading={saving} disabled={!duplicate}
            className="bg-red-600 text-white hover:bg-red-700">
            Merge & Delete Duplicate
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <PatientPicker value={duplicate} onChange={setDuplicate} />
        {duplicate && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              All appointments, visits, admissions, orders, invoices and documents belonging to{' '}
              <span className="font-medium">{duplicate.fullName}</span> ({duplicate.uhid}) will be moved onto{' '}
              <span className="font-medium">{patient?.fullName}</span> ({patient?.uhid}), and the{' '}
              <span className="font-medium">{duplicate.uhid}</span> profile will be permanently deleted. This cannot be undone.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
