import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Building2, DoorOpen, Trash2, Settings2, Pencil, Download, Filter,
  BedDouble, CheckCircle2, UserRound, Clock, Wrench,
} from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { PageSkeleton } from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  getBedMap, createWard, updateWard, deleteWard,
  createRoom, updateRoom, deleteRoom,
  createBed, updateBed, deleteBed, exportBeds,
} from '../../services/facilityService.js';
import { activeDepartments } from '../../services/departmentService.js';
import { CAN_MANAGE_ADMIN, BED_STATUS_META, WARD_TYPE_OPTIONS } from '../../utils/constants.js';

// Colour + icon for a bed cell by status — icon carries the meaning too, not just colour.
const CELL = {
  AVAILABLE: { cls: 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300', iconCls: 'text-green-600 dark:text-green-400', icon: CheckCircle2 },
  OCCUPIED: { cls: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300', iconCls: 'text-red-600 dark:text-red-400', icon: UserRound },
  RESERVED: { cls: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300', iconCls: 'text-amber-600 dark:text-amber-400', icon: Clock },
  MAINTENANCE: { cls: 'border-border bg-surface text-muted', iconCls: 'text-muted', icon: Wrench },
};

function StatTile({ label, value, tone, icon: Icon }) {
  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">{label}</p>
        {Icon && <Icon className={'h-4 w-4 ' + (tone || 'text-muted')} />}
      </div>
      <p className={'mt-1 text-2xl font-semibold ' + (tone || '')}>{value}</p>
    </Card>
  );
}

// Compact occupancy bar — how full a ward is at a glance.
function OccupancyBar({ occupied, total }) {
  const pct = total ? Math.round((occupied / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface" title={`${pct}% occupied`}>
        <div className="h-full rounded-full bg-red-500/70 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted tabular-nums">{pct}%</span>
    </div>
  );
}

export default function Beds() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const canManage = CAN_MANAGE_ADMIN.includes(role);

  const [map, setMap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [exporting, setExporting] = useState(null); // 'csv' | 'xlsx' | null

  const [wardModal, setWardModal] = useState(false);
  const [editingWard, setEditingWard] = useState(null);
  const [deletingWard, setDeletingWard] = useState(null);
  const [roomModal, setRoomModal] = useState(null); // ward object
  const [editingRoom, setEditingRoom] = useState(null); // room object
  const [deletingRoom, setDeletingRoom] = useState(null);
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

  const onExport = async (format) => {
    setExporting(format);
    try {
      await exportBeds({}, format);
    } catch (err) {
      toast.error(err.message || 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  if (loading) return <PageSkeleton />;
  const totals = map?.totals || {};

  return (
    <div className="space-y-5">
      <div className="card flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Bed Management</h1>
          <p className="mt-0.5 text-sm text-muted">Live ward, room and bed occupancy.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" loading={exporting === 'csv'} disabled={!!exporting} onClick={() => onExport('csv')}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" loading={exporting === 'xlsx'} disabled={!!exporting} onClick={() => onExport('xlsx')}>
            <Download className="h-4 w-4" /> Excel
          </Button>
          {canManage && <Button onClick={() => setWardModal(true)}><Plus className="h-4 w-4" /> Add Ward</Button>}
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Total Beds" value={totals.total || 0} icon={BedDouble} />
        <StatTile label="Available" value={totals.available || 0} tone="text-green-600 dark:text-green-400" icon={CheckCircle2} />
        <StatTile label="Occupied" value={totals.occupied || 0} tone="text-red-600 dark:text-red-400" icon={UserRound} />
        <StatTile label="Reserved" value={totals.reserved || 0} tone="text-amber-600 dark:text-amber-400" icon={Clock} />
        <StatTile label="Maintenance" value={totals.maintenance || 0} icon={Wrench} />
      </div>

      {/* Legend + filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-2.5">
        <div className="flex flex-wrap gap-4 text-xs text-muted">
          {Object.entries(BED_STATUS_META).map(([k, m]) => {
            const Icon = CELL[k].icon;
            return (
              <span key={k} className="flex items-center gap-1.5">
                <Icon className={'h-3.5 w-3.5 ' + CELL[k].iconCls} /> {m.label}
              </span>
            );
          })}
        </div>
        <button
          onClick={() => setOnlyAvailable((v) => !v)}
          className={'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ' +
            (onlyAvailable ? 'border-transparent bg-accent text-accent-fg' : 'border-border text-muted hover:bg-surface')}
        >
          <Filter className="h-3.5 w-3.5" /> Available only
        </button>
      </div>

      {/* Ward → Room → Beds */}
      {(!map || map.wards.length === 0) ? (
        <Card><EmptyState icon={Building2} title="No wards yet" description={canManage ? 'Add a ward, then rooms and beds.' : 'No wards configured.'} /></Card>
      ) : (
        <div className="space-y-4">
          {map.wards.map((w) => {
            const wardRooms = onlyAvailable
              ? w.rooms.map((r) => ({ ...r, beds: r.beds.filter((b) => b.status === 'AVAILABLE') })).filter((r) => r.beds.length > 0)
              : w.rooms;
            return (
              <Card key={w._id}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted" />
                    <h2 className="text-sm font-semibold">{w.name}</h2>
                    <Badge>{w.code}</Badge>
                    <Badge tone="neutral">{w.type?.replace(/_/g, ' ')}</Badge>
                    {w.department && <Badge tone="neutral">{w.department.name}</Badge>}
                    <span className="text-xs text-muted">{w.counts.available}/{w.counts.total} free</span>
                    <OccupancyBar occupied={w.counts.occupied} total={w.counts.total} />
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <Button variant="outline" className="h-8" onClick={() => setRoomModal(w)}><Plus className="h-4 w-4" /> Room</Button>
                      <button onClick={() => setEditingWard(w)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-muted hover:bg-elevated hover:text-fg"
                        title="Edit ward"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => setDeletingWard(w)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 text-red-500 hover:bg-red-500/20"
                        title="Delete ward"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  )}
                </div>

                {wardRooms.length === 0 ? (
                  <p className="text-sm text-muted">{onlyAvailable ? 'No available beds in this ward.' : 'No rooms in this ward.'}</p>
                ) : (
                  <div className="space-y-4">
                    {wardRooms.map((r) => (
                      <div key={r._id}>
                        <div className="mb-2 flex items-center gap-2">
                          <DoorOpen className="h-3.5 w-3.5 text-muted" />
                          <span className="text-sm font-medium">Room {r.roomNo}</span>
                          {r.status === 'INACTIVE' && <Badge tone="neutral">Inactive</Badge>}
                          {canManage && (
                            <span className="ml-1 flex items-center gap-1">
                              <button onClick={() => setBedModal({ ward: w, room: r })}
                                className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-surface text-muted hover:bg-elevated hover:text-fg"
                                title="Add bed"><Plus className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setEditingRoom({ ...r, ward: w })}
                                className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-surface text-muted hover:bg-elevated hover:text-fg"
                                title="Edit room"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setDeletingRoom({ ...r, ward: w })}
                                className="flex h-6 w-6 items-center justify-center rounded-md border border-red-500/40 bg-red-500/10 text-red-500 hover:bg-red-500/20"
                                title="Delete room"><Trash2 className="h-3.5 w-3.5" /></button>
                            </span>
                          )}
                        </div>
                        {r.beds.length === 0 ? (
                          <p className="text-xs text-muted">No beds.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {r.beds.map((b) => {
                              const clickable = b.status === 'OCCUPIED' ? !!b.currentAdmission : canManage;
                              const cell = CELL[b.status] || CELL.MAINTENANCE;
                              const StatusIcon = cell.icon;
                              const onClick = () => {
                                if (b.status === 'OCCUPIED') {
                                  if (b.currentAdmission) navigate(`/ipd/${b.currentAdmission._id || b.currentAdmission}`);
                                } else if (canManage) {
                                  setBedAction(b);
                                }
                              };
                              return (
                                <button
                                  key={b._id}
                                  onClick={onClick}
                                  className={'flex min-w-[96px] flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-transform ' + cell.cls +
                                    (clickable ? ' cursor-pointer hover:-translate-y-0.5 hover:shadow-sm' : ' cursor-default')}
                                  title={b.currentAdmission ? `Admission ${b.currentAdmission.admissionNo} — click to view` : b.status}
                                >
                                  <span className="flex items-center gap-1 text-sm font-semibold">
                                    <StatusIcon className="h-3 w-3 shrink-0" /> {b.bedNo}
                                  </span>
                                  <span className="text-[10px] uppercase tracking-wide">{BED_STATUS_META[b.status]?.label}</span>
                                  {b.dailyCharge > 0 && <span className="text-[10px] text-muted">₹{b.dailyCharge}/day</span>}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {canManage && (
        <>
          <WardModal open={wardModal} onClose={() => setWardModal(false)} departments={departments} onSaved={load} />
          <EditWardModal ward={editingWard} onClose={() => setEditingWard(null)} departments={departments} onSaved={load} />
          <ConfirmDialog
            open={!!deletingWard} onClose={() => setDeletingWard(null)}
            onConfirm={async () => {
              try { await deleteWard(deletingWard._id); toast.success('Ward deleted'); setDeletingWard(null); load(); }
              catch (err) { toast.error(err.message || 'Delete failed'); }
            }}
            title="Delete ward?"
            message={deletingWard ? `Delete ${deletingWard.name} (${deletingWard.code})? All its rooms and beds must be removed first.` : ''}
            confirmLabel="Delete"
          />
          <RoomModal ward={roomModal} onClose={() => setRoomModal(null)} onSaved={load} />
          <EditRoomModal room={editingRoom} onClose={() => setEditingRoom(null)} onSaved={load} />
          <ConfirmDialog
            open={!!deletingRoom} onClose={() => setDeletingRoom(null)}
            onConfirm={async () => {
              try { await deleteRoom(deletingRoom._id); toast.success('Room deleted'); setDeletingRoom(null); load(); }
              catch (err) { toast.error(err.message || 'Delete failed'); }
            }}
            title="Delete room?"
            message={deletingRoom ? `Delete Room ${deletingRoom.roomNo}? All its beds must be removed first.` : ''}
            confirmLabel="Delete"
          />
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

function EditWardModal({ ward, onClose, departments, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', code: '', type: 'GENERAL', department: '', floor: '', status: 'ACTIVE' });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!ward) return;
    setForm({
      name: ward.name || '', code: ward.code || '', type: ward.type || 'GENERAL',
      department: ward.department?._id || ward.department?.id || ward.department || '',
      floor: ward.floor || '', status: ward.status || 'ACTIVE',
    });
  }, [ward]);
  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await updateWard(ward._id, { ...form, department: form.department || null });
      toast.success('Ward updated'); onSaved(); onClose();
    } catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };
  const deptOptions = [{ value: '', label: 'None' }, ...departments.map((d) => ({ value: d.id || d._id, label: d.name }))];
  const statusOptions = [{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }];
  return (
    <Modal open={!!ward} onClose={onClose} size="md" title={ward ? `Edit Ward · ${ward.name}` : ''}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="ward-edit-f" loading={saving}>Save</Button></>}>
      <form id="ward-edit-f" onSubmit={submit} className="grid grid-cols-2 gap-4">
        <Input label="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <Input label="Code *" className="uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
        <Select label="Type" options={WARD_TYPE_OPTIONS} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
        <Select label="Department" options={deptOptions} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
        <Input label="Floor" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
        <Select label="Status" options={statusOptions} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />
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

function EditRoomModal({ room, onClose, onSaved }) {
  const toast = useToast();
  const [roomNo, setRoomNo] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (room) { setRoomNo(room.roomNo || ''); setStatus(room.status || 'ACTIVE'); } }, [room]);
  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await updateRoom(room._id, { roomNo, status });
      toast.success('Room updated'); onSaved(); onClose();
    } catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };
  const statusOptions = [{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }];
  return (
    <Modal open={!!room} onClose={onClose} size="sm" title={room ? `Edit Room · ${room.ward?.name}` : ''}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="room-edit-f" loading={saving}>Save</Button></>}>
      <form id="room-edit-f" onSubmit={submit} className="space-y-4">
        <Input label="Room Number *" value={roomNo} onChange={(e) => setRoomNo(e.target.value)} required />
        <Select label="Status" options={statusOptions} value={status} onChange={(e) => setStatus(e.target.value)} />
      </form>
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
  const [bedNo, setBedNo] = useState('');
  const [dailyCharge, setDailyCharge] = useState('');
  const [status, setStatus] = useState('AVAILABLE');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!bed) return;
    setBedNo(bed.bedNo || '');
    setDailyCharge(bed.dailyCharge ?? '');
    setStatus(bed.status);
  }, [bed]);
  const apply = async () => {
    setSaving(true);
    try {
      await updateBed(bed._id, { bedNo, dailyCharge: Number(dailyCharge) || 0, status });
      toast.success('Bed updated'); onSaved(); onClose();
    } catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
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
      <div className="space-y-4">
        <Input label="Bed No" value={bedNo} onChange={(e) => setBedNo(e.target.value)} />
        <Input label="Daily Charge ₹" type="number" value={dailyCharge} onChange={(e) => setDailyCharge(e.target.value)} />
        <Select label="Status" options={opts} value={status} onChange={(e) => setStatus(e.target.value)} />
      </div>
    </Modal>
  );
}
