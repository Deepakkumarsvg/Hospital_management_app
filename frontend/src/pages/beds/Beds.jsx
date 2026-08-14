import { useEffect, useState, useCallback } from 'react';
import { BedDouble, Plus, Building2, DoorOpen, Trash2, Settings2 } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  getBedMap, createWard, createRoom, createBed, updateBed, deleteBed,
} from '../../services/facilityService.js';
import { activeDepartments } from '../../services/departmentService.js';
import { CAN_MANAGE_ADMIN, BED_STATUS_META, WARD_TYPE_OPTIONS } from '../../utils/constants.js';

// Colour a bed cell by status.
const CELL = {
  AVAILABLE: 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300',
  OCCUPIED: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  RESERVED: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  MAINTENANCE: 'border-border bg-surface text-muted',
};

function StatTile({ label, value, tone }) {
  return (
    <Card className="!p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={'mt-1 text-2xl font-semibold ' + (tone || '')}>{value}</p>
    </Card>
  );
}

export default function Beds() {
  const { role } = useAuth();
  const toast = useToast();
  const canManage = CAN_MANAGE_ADMIN.includes(role);

  const [map, setMap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);

  const [wardModal, setWardModal] = useState(false);
  const [roomModal, setRoomModal] = useState(null); // ward object
  const [bedModal, setBedModal] = useState(null);    // { ward, room }
  const [bedAction, setBedAction] = useState(null);  // bed object

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMap(await getBedMap());
    } catch (err) {
      toast.error(err.message || 'Failed to load bed map');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); if (canManage) activeDepartments().then(setDepartments).catch(() => {}); }, [load, canManage]);

  if (loading) return <Spinner full />;
  const totals = map?.totals || {};

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Bed Management</h1>
          <p className="mt-0.5 text-sm text-muted">Live ward, room and bed occupancy.</p>
        </div>
        {canManage && <Button onClick={() => setWardModal(true)}><Plus className="h-4 w-4" /> Add Ward</Button>}
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatTile label="Total Beds" value={totals.total || 0} />
        <StatTile label="Available" value={totals.available || 0} tone="text-green-600 dark:text-green-400" />
        <StatTile label="Occupied" value={totals.occupied || 0} tone="text-red-600 dark:text-red-400" />
        <StatTile label="Reserved" value={totals.reserved || 0} tone="text-amber-600 dark:text-amber-400" />
        <StatTile label="Maintenance" value={totals.maintenance || 0} />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-muted">
        {Object.entries(BED_STATUS_META).map(([k, m]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={'inline-block h-3 w-3 rounded border ' + CELL[k]} /> {m.label}
          </span>
        ))}
      </div>

      {/* Ward → Room → Beds */}
      {(!map || map.wards.length === 0) ? (
        <Card><EmptyState icon={Building2} title="No wards yet" description={canManage ? 'Add a ward, then rooms and beds.' : 'No wards configured.'} /></Card>
      ) : (
        <div className="space-y-4">
          {map.wards.map((w) => (
            <Card key={w._id}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted" />
                  <h2 className="text-sm font-semibold">{w.name}</h2>
                  <Badge>{w.code}</Badge>
                  <Badge tone="neutral">{w.type?.replace(/_/g, ' ')}</Badge>
                  <span className="text-xs text-muted">{w.counts.available}/{w.counts.total} free</span>
                </div>
                {canManage && (
                  <Button variant="outline" className="h-8" onClick={() => setRoomModal(w)}><Plus className="h-4 w-4" /> Room</Button>
                )}
              </div>

              {w.rooms.length === 0 ? (
                <p className="text-sm text-muted">No rooms in this ward.</p>
              ) : (
                <div className="space-y-4">
                  {w.rooms.map((r) => (
                    <div key={r._id}>
                      <div className="mb-2 flex items-center gap-2">
                        <DoorOpen className="h-3.5 w-3.5 text-muted" />
                        <span className="text-sm font-medium">Room {r.roomNo}</span>
                        {canManage && (
                          <button onClick={() => setBedModal({ ward: w, room: r })} className="text-xs text-muted hover:text-fg">+ bed</button>
                        )}
                      </div>
                      {r.beds.length === 0 ? (
                        <p className="text-xs text-muted">No beds.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {r.beds.map((b) => (
                            <button
                              key={b._id}
                              onClick={() => canManage && b.status !== 'OCCUPIED' && setBedAction(b)}
                              className={'flex min-w-[92px] flex-col items-start rounded-lg border px-3 py-2 text-left ' + CELL[b.status] +
                                (canManage && b.status !== 'OCCUPIED' ? ' cursor-pointer hover:opacity-80' : ' cursor-default')}
                              title={b.currentAdmission ? `Admission ${b.currentAdmission.admissionNo}` : b.status}
                            >
                              <span className="text-sm font-semibold">{b.bedNo}</span>
                              <span className="text-[10px] uppercase tracking-wide">{BED_STATUS_META[b.status]?.label}</span>
                              {b.dailyCharge > 0 && <span className="text-[10px] text-muted">₹{b.dailyCharge}/day</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {canManage && (
        <>
          <WardModal open={wardModal} onClose={() => setWardModal(false)} departments={departments} onSaved={load} />
          <RoomModal ward={roomModal} onClose={() => setRoomModal(null)} onSaved={load} />
          <BedModal ctx={bedModal} onClose={() => setBedModal(null)} onSaved={load} />
          <BedActionModal bed={bedAction} onClose={() => setBedAction(null)} onSaved={load} />
        </>
      )}
    </div>
  );
}

/* ---- modals ---- */
function WardModal({ open, onClose, departments, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', code: '', type: 'GENERAL', department: '', floor: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setForm({ name: '', code: '', type: 'GENERAL', department: '', floor: '' }); }, [open]);
  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await createWard({ ...form, department: form.department || null });
      toast.success('Ward created'); onSaved(); onClose();
    } catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };
  const deptOptions = [{ value: '', label: 'None' }, ...departments.map((d) => ({ value: d.id || d._id, label: d.name }))];
  return (
    <Modal open={open} onClose={onClose} size="md" title="Add Ward"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="ward-f" loading={saving}>Create</Button></>}>
      <form id="ward-f" onSubmit={submit} className="grid grid-cols-2 gap-4">
        <Input label="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <Input label="Code *" className="uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
        <Select label="Type" options={WARD_TYPE_OPTIONS} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
        <Select label="Department" options={deptOptions} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
        <Input label="Floor" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
      </form>
    </Modal>
  );
}

function RoomModal({ ward, onClose, onSaved }) {
  const toast = useToast();
  const [roomNo, setRoomNo] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (ward) setRoomNo(''); }, [ward]);
  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await createRoom({ ward: ward._id, roomNo });
      toast.success('Room created'); onSaved(); onClose();
    } catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };
  return (
    <Modal open={!!ward} onClose={onClose} size="sm" title={ward ? `Add Room · ${ward.name}` : ''}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="room-f" loading={saving}>Create</Button></>}>
      <form id="room-f" onSubmit={submit}><Input label="Room Number *" value={roomNo} onChange={(e) => setRoomNo(e.target.value)} required /></form>
    </Modal>
  );
}

function BedModal({ ctx, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ bedNo: '', dailyCharge: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (ctx) setForm({ bedNo: '', dailyCharge: '' }); }, [ctx]);
  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await createBed({ room: ctx.room._id, bedNo: form.bedNo, dailyCharge: Number(form.dailyCharge) || 0 });
      toast.success('Bed created'); onSaved(); onClose();
    } catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };
  return (
    <Modal open={!!ctx} onClose={onClose} size="sm" title={ctx ? `Add Bed · Room ${ctx.room.roomNo}` : ''}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="bed-f" loading={saving}>Create</Button></>}>
      <form id="bed-f" onSubmit={submit} className="grid grid-cols-2 gap-4">
        <Input label="Bed No *" value={form.bedNo} onChange={(e) => setForm({ ...form, bedNo: e.target.value })} required />
        <Input label="Daily Charge ₹" type="number" value={form.dailyCharge} onChange={(e) => setForm({ ...form, dailyCharge: e.target.value })} />
      </form>
    </Modal>
  );
}

function BedActionModal({ bed, onClose, onSaved }) {
  const toast = useToast();
  const [status, setStatus] = useState('AVAILABLE');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (bed) setStatus(bed.status); }, [bed]);
  const apply = async () => {
    setSaving(true);
    try { await updateBed(bed._id, { status }); toast.success('Bed updated'); onSaved(); onClose(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };
  const remove = async () => {
    setSaving(true);
    try { await deleteBed(bed._id); toast.success('Bed deleted'); onSaved(); onClose(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };
  const opts = [{ value: 'AVAILABLE', label: 'Available' }, { value: 'RESERVED', label: 'Reserved' }, { value: 'MAINTENANCE', label: 'Maintenance' }];
  return (
    <Modal open={!!bed} onClose={onClose} size="sm" title={bed ? `Bed ${bed.bedNo}` : ''}
      footer={<>
        <Button variant="outline" onClick={remove} loading={saving} className="mr-auto !text-red-500"><Trash2 className="h-4 w-4" /> Delete</Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={apply} loading={saving}><Settings2 className="h-4 w-4" /> Update</Button>
      </>}>
      <Select label="Status" options={opts} value={status} onChange={(e) => setStatus(e.target.value)} />
    </Modal>
  );
}
