import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { flagMLC } from '../../services/emergencyService.js';

// The presentations that carry a statutory duty to inform the police. Listing
// them means the system prompts rather than relying on a clerk to remember at
// three in the morning.
const NATURES = [
  { value: 'ROAD_TRAFFIC_ACCIDENT', label: 'Road traffic accident' },
  { value: 'ASSAULT', label: 'Assault' },
  { value: 'POISONING', label: 'Poisoning' },
  { value: 'BURNS', label: 'Burns' },
  { value: 'SUICIDE_ATTEMPT', label: 'Suicide attempt' },
  { value: 'SEXUAL_ASSAULT', label: 'Sexual assault' },
  { value: 'INDUSTRIAL_ACCIDENT', label: 'Industrial accident' },
  { value: 'FIREARM', label: 'Firearm injury' },
  { value: 'DROWNING', label: 'Drowning' },
  { value: 'OTHER', label: 'Other' },
];

export default function MlcModal({ visit, onClose, onSaved }) {
  const toast = useToast();
  const [nature, setNature] = useState('ROAD_TRAFFIC_ACCIDENT');
  const [policeStation, setPoliceStation] = useState('');
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visit) return;
    setNature(visit.mlc?.nature || 'ROAD_TRAFFIC_ACCIDENT');
    setPoliceStation(visit.mlc?.policeStation || '');
    setDetails(visit.mlc?.details || '');
  }, [visit]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await flagMLC(visit._id || visit.id, {
        nature,
        policeStation: policeStation.trim() || undefined,
        details: details.trim() || undefined,
      });
      toast.success('Recorded as medico-legal'); onSaved(); onClose();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  return (
    <Modal open={!!visit} onClose={onClose} size="md"
      title={visit ? `Medico-legal · ${visit.displayName}` : ''}
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" form="er-mlc" loading={saving}>Save</Button></>}>
      <form id="er-mlc" onSubmit={submit} className="space-y-4">
        {visit?.mlc?.mlcNo && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">MLC number</span>
            <Badge tone="danger">{visit.mlc.mlcNo}</Badge>
          </div>
        )}

        <Select label="Nature of case *" value={nature} onChange={(e) => setNature(e.target.value)} options={NATURES} />

        <Input label="Police station informed" value={policeStation}
          onChange={(e) => setPoliceStation(e.target.value)} placeholder="Andheri East" />
        <p className="-mt-2 text-xs text-muted">
          Leave blank if the police have not been informed yet. The record only stamps the
          intimation once a station is named — flagging a case and reporting it are two different
          acts, and the register must not claim the second because somebody did the first.
        </p>

        <div>
          <label className="label">Circumstances as reported</label>
          <textarea rows={3} className="input resize-y" value={details} onChange={(e) => setDetails(e.target.value)}
            placeholder="Account of the incident as given by whoever brought the patient in" />
        </div>
      </form>
    </Modal>
  );
}
