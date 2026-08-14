import { useEffect, useState, useCallback } from 'react';
import { Truck, Plus, Pencil, Trash2, MapPin, CheckCircle2, XCircle } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
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
import {
  listAmbulances, createAmbulance, updateAmbulance, deleteAmbulance,
  listTrips, startTrip, endTrip, getAmbulanceStats,
} from '../../services/ambulanceService.js';
import { CAN_AMBULANCE_MANAGE, CAN_MANAGE_ADMIN, AMBULANCE_STATUS_META, TRIP_STATUS_META, money, formatDateTime } from '../../utils/constants.js';

const TYPE_OPTIONS = ['BASIC', 'ADVANCED', 'ICU'].map((v) => ({ value: v, label: v }));

function Fleet({ canManage, canAdmin, onChanged }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [deleting, setDeleting] = useState(null);
  const [tripFor, setTripFor] = useState(null);
  const [trip, setTrip] = useState({});
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { setItems(await listAmbulances()); } catch (e) { toast.error(e.message); } finally { setLoading(false); } }, [toast]);
  useEffect(() => { load(); }, [load]);
  const open = (a) => { setEditing(a); setForm(a ? { vehicleNo: a.vehicleNo, type: a.type, driverName: a.driverName, driverPhone: a.driverPhone, status: a.status } : { vehicleNo: '', type: 'BASIC', driverName: '', driverPhone: '', status: 'AVAILABLE' }); setFormOpen(true); };
  const submit = async (e) => { e.preventDefault(); setSaving(true); try { editing ? await updateAmbulance(editing.id || editing._id, form) : await createAmbulance(form); toast.success('Saved'); setFormOpen(false); load(); onChanged(); } catch (e2) { toast.error(e2.message); } finally { setSaving(false); } };
  const del = async () => { try { await deleteAmbulance(deleting.id || deleting._id); toast.success('Deleted'); setDeleting(null); load(); } catch (e) { toast.error(e.message); } };
  const dispatch = async (e) => { e.preventDefault(); setSaving(true); try { await startTrip({ ambulance: tripFor.id || tripFor._id, ...trip, charges: Number(trip.charges) || 0 }); toast.success('Trip started'); setTripFor(null); load(); onChanged(); } catch (e2) { toast.error(e2.message); } finally { setSaving(false); } };
  if (loading) return <Spinner full />;
  return (
    <div className="space-y-4">
      {canAdmin && <div className="flex justify-end"><Button onClick={() => open(null)}><Plus className="h-4 w-4" /> New Ambulance</Button></div>}
      {items.length === 0 ? <EmptyState icon={Truck} title="No ambulances" /> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted"><th className="px-4 py-3 font-medium">Vehicle</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Driver</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 text-right font-medium">Actions</th></tr></thead>
          <tbody>{items.map((a) => { const meta = AMBULANCE_STATUS_META[a.status]; return (
            <tr key={a.id || a._id} className="border-b border-border/60 last:border-0 hover:bg-surface"><td className="px-4 py-3 font-mono text-xs font-medium">{a.vehicleNo}</td><td className="px-4 py-3"><Badge>{a.type}</Badge></td><td className="px-4 py-3">{a.driverName || '—'} <span className="text-xs text-muted">{a.driverPhone}</span></td><td className="px-4 py-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
            <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">{canManage && a.status === 'AVAILABLE' && <button onClick={() => { setTripFor(a); setTrip({ patientName: '', pickup: '', drop: '', purpose: '', charges: '' }); }} className="btn-ghost h-8 !px-2 text-xs"><MapPin className="h-4 w-4" /> Dispatch</button>}{canAdmin && <><button onClick={() => open(a)} className="btn-ghost h-8 w-8 !p-0"><Pencil className="h-4 w-4" /></button><button onClick={() => setDeleting(a)} className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button></>}</div></td></tr>
          ); })}</tbody>
        </table></div>
      )}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} size="md" title={editing ? 'Edit Ambulance' : 'New Ambulance'} footer={<><Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" form="amb-f" loading={saving}>Save</Button></>}>
        <form id="amb-f" onSubmit={submit} className="grid grid-cols-2 gap-4"><Input label="Vehicle No *" className="uppercase" value={form.vehicleNo} onChange={(e) => setForm({ ...form, vehicleNo: e.target.value })} required /><Select label="Type" options={TYPE_OPTIONS} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} /><Input label="Driver Name" value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} /><Input label="Driver Phone" value={form.driverPhone} onChange={(e) => setForm({ ...form, driverPhone: e.target.value })} /></form>
      </Modal>
      <Modal open={!!tripFor} onClose={() => setTripFor(null)} size="md" title={tripFor ? `Dispatch ${tripFor.vehicleNo}` : ''} footer={<><Button variant="outline" onClick={() => setTripFor(null)}>Cancel</Button><Button type="submit" form="trip-f" loading={saving}>Start Trip</Button></>}>
        <form id="trip-f" onSubmit={dispatch} className="grid grid-cols-2 gap-4"><Input className="col-span-2" label="Patient / Caller" value={trip.patientName || ''} onChange={(e) => setTrip({ ...trip, patientName: e.target.value })} /><Input label="Pickup" value={trip.pickup || ''} onChange={(e) => setTrip({ ...trip, pickup: e.target.value })} /><Input label="Drop" value={trip.drop || ''} onChange={(e) => setTrip({ ...trip, drop: e.target.value })} /><Input label="Purpose" value={trip.purpose || ''} onChange={(e) => setTrip({ ...trip, purpose: e.target.value })} /><Input label="Charges ₹" type="number" value={trip.charges || ''} onChange={(e) => setTrip({ ...trip, charges: e.target.value })} /></form>
      </Modal>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={del} title="Delete ambulance?" message={deleting ? `Delete ${deleting.vehicleNo}?` : ''} confirmLabel="Delete" />
    </div>
  );
}

function Trips({ canManage, onChanged }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const load = useCallback(async () => { setLoading(true); try { setItems(await listTrips()); } catch (e) { toast.error(e.message); } finally { setLoading(false); } }, [toast]);
  useEffect(() => { load(); }, [load]);
  const close = async (t, status) => { setBusy(t.id || t._id); try { await endTrip(t.id || t._id, status); toast.success(`Trip ${status}`); load(); onChanged(); } catch (e) { toast.error(e.message); } finally { setBusy(null); } };
  if (loading) return <Spinner full />;
  if (items.length === 0) return <EmptyState icon={MapPin} title="No trips" />;
  return (
    <div className="card overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
      <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted"><th className="px-4 py-3 font-medium">Trip No</th><th className="px-4 py-3 font-medium">Vehicle</th><th className="px-4 py-3 font-medium">Route</th><th className="px-4 py-3 font-medium">Charges</th><th className="px-4 py-3 font-medium">Status</th>{canManage && <th className="px-4 py-3 text-right font-medium">Action</th>}</tr></thead>
      <tbody>{items.map((t) => { const meta = TRIP_STATUS_META[t.status]; const id = t.id || t._id; return (
        <tr key={id} className="border-b border-border/60 last:border-0 hover:bg-surface"><td className="px-4 py-3 font-mono text-xs">{t.tripNo}</td><td className="px-4 py-3">{t.ambulance?.vehicleNo}</td><td className="px-4 py-3 text-muted">{t.pickup} → {t.drop}</td><td className="px-4 py-3 tabular-nums">{money(t.charges)}</td><td className="px-4 py-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
        {canManage && <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">{t.status === 'ONGOING' && <><button onClick={() => close(t, 'COMPLETED')} disabled={busy === id} className="rounded-lg border border-green-500/30 px-2 py-1 text-xs text-green-600 hover:bg-green-500/10 dark:text-green-400"><CheckCircle2 className="inline h-3.5 w-3.5" /> Complete</button><button onClick={() => close(t, 'CANCELLED')} disabled={busy === id} className="rounded-lg border border-red-500/30 px-2 py-1 text-xs text-red-500 hover:bg-red-500/10"><XCircle className="inline h-3.5 w-3.5" /> Cancel</button></>}</div></td>}</tr>
      ); })}</tbody>
    </table></div>
  );
}

export default function Ambulance() {
  const { role } = useAuth();
  const canManage = CAN_AMBULANCE_MANAGE.includes(role);
  const canAdmin = CAN_MANAGE_ADMIN.includes(role);
  const [tab, setTab] = useState('Fleet');
  const [stats, setStats] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const loadStats = useCallback(() => getAmbulanceStats().then(setStats).catch(() => {}), []);
  useEffect(() => { loadStats(); }, [loadStats, refresh, tab]);
  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-semibold">Ambulance</h1><p className="mt-0.5 text-sm text-muted">Fleet and trip management.</p></div>
      {stats && <div className="grid grid-cols-3 gap-4"><Card className="!p-4"><p className="text-xs text-muted">Total</p><p className="mt-1 text-2xl font-semibold">{stats.total}</p></Card><Card className="!p-4"><p className="text-xs text-muted">Available</p><p className="mt-1 text-2xl font-semibold text-green-600 dark:text-green-400">{stats.available}</p></Card><Card className="!p-4"><p className="text-xs text-muted">Ongoing Trips</p><p className="mt-1 text-2xl font-semibold">{stats.ongoing}</p></Card></div>}
      <div className="flex gap-1 border-b border-border">{['Fleet', 'Trips'].map((t) => <button key={t} onClick={() => setTab(t)} className={'rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ' + (tab === t ? 'border-b-2 border-fg text-fg' : 'text-muted hover:text-fg')}>{t}</button>)}</div>
      {tab === 'Fleet' ? <Fleet key={refresh} canManage={canManage} canAdmin={canAdmin} onChanged={() => setRefresh((r) => r + 1)} /> : <Trips canManage={canManage} onChanged={() => setRefresh((r) => r + 1)} />}
    </div>
  );
}
