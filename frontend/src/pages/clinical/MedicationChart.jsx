import { useCallback, useEffect, useState } from 'react';
import { Pill, Plus, Ban, Check, AlertTriangle, PauseCircle, PlayCircle } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  clinicalOptions, getMar, prescribe, stopOrder, holdOrder, administer,
} from '../../services/clinicalService.js';
import { activeDoctors } from '../../services/doctorService.js';

const ADMIN_STATUSES = [
  { value: 'GIVEN', label: 'Given' },
  { value: 'REFUSED', label: 'Patient refused' },
  { value: 'OMITTED', label: 'Omitted' },
  { value: 'WITHHELD', label: 'Withheld (clinical decision)' },
  { value: 'NOT_AVAILABLE', label: 'Not available' },
];

const fmtTime = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const todayISO = () => new Date().toISOString().slice(0, 10);

// A dose slot reads at a glance or it is useless on a drug round: given,
// explained, still to come, or overdue.
function SlotCell({ slot, onSign, canSign }) {
  const { record, overdue, scheduledFor } = slot;

  if (record) {
    const given = record.status === 'GIVEN';
    return (
      <button
        type="button"
        disabled
        title={`${record.status}${record.reason ? ` — ${record.reason}` : ''} · ${record.administeredBy?.name || ''}`}
        className={`flex h-14 w-full flex-col items-center justify-center rounded-lg border text-[11px] ${
          given ? 'border-green-600/40 bg-green-600/10 text-green-700 dark:text-green-400'
                : 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400'
        }`}
      >
        <span className="font-medium">{fmtTime(scheduledFor)}</span>
        {given ? <Check className="h-4 w-4" /> : <span className="px-1 text-center leading-tight">{record.status.replace('_', ' ').toLowerCase()}</span>}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => canSign && onSign(slot)}
      disabled={!canSign}
      className={`flex h-14 w-full flex-col items-center justify-center rounded-lg border text-[11px] transition ${
        overdue
          ? 'border-red-600/50 bg-red-600/10 text-red-700 dark:text-red-400'
          : 'border-dashed border-border text-muted'
      } ${canSign ? 'hover:border-fg hover:text-fg' : ''}`}
    >
      <span className="font-medium">{fmtTime(scheduledFor)}</span>
      {overdue ? <AlertTriangle className="h-4 w-4" /> : <span>due</span>}
    </button>
  );
}

function PrescribeModal({ open, encounter, patient, encounterType, options, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ medicineName: '', dose: '', route: 'ORAL', frequency: 'TDS', instructions: '', prescribedBy: '' });
  const [doctors, setDoctors] = useState([]);
  const [override, setOverride] = useState(null); // { warnings, reason }
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ medicineName: '', dose: '', route: 'ORAL', frequency: 'TDS', instructions: '', prescribedBy: '' });
    setOverride(null);
    activeDoctors().then(setDoctors).catch(() => setDoctors([]));
  }, [open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.medicineName.trim() || !form.dose.trim()) { toast.error('Medicine and dose are required'); return; }
    if (!form.prescribedBy) { toast.error('Select the prescribing doctor'); return; }

    setSaving(true);
    try {
      await prescribe({
        patient, encounterType, encounter, ...form,
        overrideReason: override?.reason || undefined,
      });
      toast.success('Prescribed'); onSaved(); onClose();
    } catch (err) {
      // An allergy clash is not a failure to report as an error — it is a
      // decision to put in front of the prescriber, with the clash named.
      if (err.code === 'ALLERGY_WARNING') {
        setOverride({ warnings: err.details?.warnings || [], reason: '' });
      } else {
        toast.error(err.message);
      }
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Prescribe"
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" form="rx-f" loading={saving}>
          {override ? 'Prescribe anyway' : 'Prescribe'}
        </Button></>}>
      <form id="rx-f" onSubmit={submit} className="space-y-4">
        {override && (
          <div className="rounded-lg border border-red-600/50 bg-red-600/10 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
              Clashes with a recorded allergy: {override.warnings.join(', ')}
            </p>
            <Input
              className="mt-2"
              label="Reason for prescribing anyway *"
              value={override.reason}
              onChange={(e) => setOverride((o) => ({ ...o, reason: e.target.value }))}
              placeholder="Mild rash only; benefit outweighs risk"
            />
            <p className="mt-1 text-xs text-muted">
              Recorded on the order as it stands now — so a reviewer sees what you saw, not what
              the allergy list says later.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input label="Medicine *" value={form.medicineName} onChange={(e) => set('medicineName', e.target.value)}
            placeholder="Paracetamol" />
          <Input label="Dose *" value={form.dose} onChange={(e) => set('dose', e.target.value)} placeholder="500 mg" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Route" value={form.route} onChange={(e) => set('route', e.target.value)}
            options={(options?.routes || []).map((r) => ({ value: r, label: r }))} />
          <Select label="Frequency *" value={form.frequency} onChange={(e) => set('frequency', e.target.value)}
            options={(options?.frequencies || []).map((f) => ({ value: f.code, label: `${f.code} · ${f.label}` }))} />
        </div>
        <Select label="Prescribed by *" value={form.prescribedBy} onChange={(e) => set('prescribedBy', e.target.value)}
          placeholder="Select doctor"
          options={doctors.map((d) => ({ value: d.id || d._id, label: `Dr. ${d.firstName} ${d.lastName || ''}`.trim() }))} />
        <Input label="Instructions" value={form.instructions} onChange={(e) => set('instructions', e.target.value)}
          placeholder="After food" />
      </form>
    </Modal>
  );
}

function AdministerModal({ slot, order, onClose, onSaved }) {
  const toast = useToast();
  const [status, setStatus] = useState('GIVEN');
  const [reason, setReason] = useState('');
  const [doseGiven, setDoseGiven] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (slot) { setStatus('GIVEN'); setReason(''); setDoseGiven(''); } }, [slot]);

  const submit = async (e) => {
    e.preventDefault();
    if (status !== 'GIVEN' && !reason.trim()) { toast.error('Say why the dose was not given'); return; }
    setSaving(true);
    try {
      await administer(order._id || order.id, {
        scheduledFor: slot.scheduledFor, status,
        reason: reason.trim() || undefined,
        doseGiven: doseGiven.trim() || undefined,
      });
      toast.success('Recorded'); onSaved(); onClose();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  return (
    <Modal open={!!slot} onClose={onClose} size="md"
      title={slot ? `${order.medicineName} · ${fmtTime(slot.scheduledFor)}` : ''}
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" form="mar-f" loading={saving}>Record</Button></>}>
      <form id="mar-f" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted">
          {order?.dose} · {order?.route} · {order?.instructions || 'no special instructions'}
        </p>

        <Select label="Outcome *" value={status} onChange={(e) => setStatus(e.target.value)} options={ADMIN_STATUSES} />

        {status !== 'GIVEN' && (
          <Input label="Reason *" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Nil by mouth for theatre / patient declined" />
        )}
        {status === 'GIVEN' && (
          <Input label="Dose given (if different)" value={doseGiven} onChange={(e) => setDoseGiven(e.target.value)}
            placeholder={order?.dose} />
        )}
        <p className="text-xs text-muted">
          A dose that was not given still has to be accounted for — an unexplained blank is what
          makes a chart useless when somebody asks what happened.
        </p>
      </form>
    </Modal>
  );
}

export default function MedicationChart({ encounter, patient, encounterType = 'IPD' }) {
  const { can } = useAuth();
  const toast = useToast();
  const [chart, setChart] = useState(null);
  const [options, setOptions] = useState(null);
  const [day, setDay] = useState(todayISO());
  const [rxOpen, setRxOpen] = useState(false);
  const [signing, setSigning] = useState(null); // { slot, order }
  const [stopping, setStopping] = useState(null);

  const load = useCallback(async () => {
    try { setChart(await getMar(encounter, day)); }
    catch (e) { toast.error(e.message); setChart([]); }
  }, [encounter, day, toast]);

  useEffect(() => { clinicalOptions().then(setOptions).catch(() => setOptions(null)); }, []);
  useEffect(() => { load(); }, [load]);

  const stop = async () => {
    try {
      await stopOrder(stopping._id || stopping.id, 'Stopped from the drug chart');
      toast.success('Stopped'); setStopping(null); load();
    } catch (e) { toast.error(e.message); setStopping(null); }
  };

  const toggleHold = async (order) => {
    try {
      await holdOrder(order._id || order.id, order.status !== 'HELD');
      load();
    } catch (e) { toast.error(e.message); }
  };

  if (!chart) return <ListSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Pill className="h-4 w-4" /> Drug chart
        </h3>
        <div className="flex items-center gap-2">
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-40" />
          {can('clinical:prescribe') && (
            <Button size="sm" onClick={() => setRxOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Prescribe
            </Button>
          )}
        </div>
      </div>

      {chart.length === 0 ? (
        <Card><EmptyState icon={Pill} title="Nothing prescribed" description="No active medication orders for this admission." /></Card>
      ) : (
        <div className="space-y-3">
          {chart.map(({ order, slots }) => (
            <Card key={order._id || order.id} className="!p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{order.medicineName}</span>
                    <span className="text-sm text-muted">{order.dose} · {order.route} · {order.frequency}</span>
                    {order.status === 'HELD' && <Badge tone="warning">On hold</Badge>}
                    {order.status === 'STOPPED' && <Badge tone="neutral">Stopped</Badge>}
                    {order.allergyWarnings?.length > 0 && (
                      <Badge tone="danger" title={order.overrideReason}>
                        <AlertTriangle className="mr-1 inline h-3 w-3" />
                        Allergy override
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {order.instructions || 'No special instructions'}
                    {order.prescribedBy && ` · Dr. ${order.prescribedBy.firstName} ${order.prescribedBy.lastName || ''}`}
                  </p>
                </div>

                {can('clinical:prescribe') && order.status !== 'STOPPED' && (
                  <div className="flex gap-1">
                    <button onClick={() => toggleHold(order)} className="btn-ghost h-8 w-8 !p-0"
                      title={order.status === 'HELD' ? 'Resume' : 'Hold'}>
                      {order.status === 'HELD' ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
                    </button>
                    <button onClick={() => setStopping(order)} className="btn-ghost h-8 w-8 !p-0" title="Stop">
                      <Ban className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {slots.length === 0 ? (
                <p className="mt-3 text-xs text-muted">
                  As required — no scheduled doses. Record each administration as it happens.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {slots.map((slot) => (
                    <SlotCell
                      key={slot.scheduledFor}
                      slot={slot}
                      canSign={can('clinical:administer') && order.status === 'ACTIVE'}
                      onSign={(s) => setSigning({ slot: s, order })}
                    />
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <PrescribeModal open={rxOpen} encounter={encounter} patient={patient} encounterType={encounterType}
        options={options} onClose={() => setRxOpen(false)} onSaved={load} />
      <AdministerModal slot={signing?.slot} order={signing?.order}
        onClose={() => setSigning(null)} onSaved={load} />
      <ConfirmDialog
        open={!!stopping}
        title="Stop this medicine?"
        message={stopping ? `${stopping.medicineName} will stop appearing on the chart. Doses already recorded stay.` : ''}
        confirmLabel="Stop"
        onConfirm={stop}
        onClose={() => setStopping(null)}
      />
    </div>
  );
}
