import { useEffect, useState, useCallback, useRef } from 'react';
import { Truck, Plus, Pencil, Trash2, MapPin, CheckCircle2, XCircle, Search, Download, FileDown, ListFilter } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import PatientPicker from '../appointments/PatientPicker.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  listAmbulances, createAmbulance, updateAmbulance, deleteAmbulance,
  listTrips, startTrip, updateTrip, endTrip, exportTrips, downloadTripReceiptPdf, getAmbulanceStats,
} from '../../services/ambulanceService.js';
import { CAN_AMBULANCE_MANAGE, CAN_MANAGE_ADMIN, AMBULANCE_STATUS_META, TRIP_STATUS_META, money } from '../../utils/constants.js';

const TYPE_OPTIONS = ['BASIC', 'ADVANCED', 'ICU'].map((v) => ({ value: v, label: v }));
const STATUS_OPTIONS = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'ON_TRIP', label: 'On trip' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
];
const TYPE_FILTER = [{ value: 'ALL', label: 'All types' }, ...TYPE_OPTIONS];
// Starting-point base fares by ambulance type — editable per trip, just
// saves re-typing the same number every time.
const BASE_RATES = { BASIC: 500, ADVANCED: 1000, ICU: 2000 };

function Fleet({ canManage, canAdmin, onChanged, onViewTrips }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [deleting, setDeleting] = useState(null);
  const [tripFor, setTripFor] = useState(null);
  const [trip, setTrip] = useState({});
  const [tripPatient, setTripPatient] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await listAmbulances()); } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const open = (a) => {
    setEditing(a);
    setForm(a
      ? { vehicleNo: a.vehicleNo, type: a.type, driverName: a.driverName, driverPhone: a.driverPhone, status: a.status }
      : { vehicleNo: '', type: 'BASIC', driverName: '', driverPhone: '', status: 'AVAILABLE' });
    setFormOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      editing ? await updateAmbulance(editing.id || editing._id, form) : await createAmbulance(form);
      toast.success('Saved'); setFormOpen(false); load(); onChanged();
    } catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };

  const del = async () => {
    try { await deleteAmbulance(deleting.id || deleting._id); toast.success('Deleted'); setDeleting(null); load(); }
    catch (err) { toast.error(err.message || 'Failed'); }
  };

  const dispatch = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await startTrip({
        ambulance: tripFor.id || tripFor._id,
        patient: tripPatient ? (tripPatient.id || tripPatient._id) : undefined,
        ...trip,
        charges: Number(trip.charges) || 0,
      });
      toast.success('Trip started'); setTripFor(null); load(); onChanged();
    } catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };

  if (loading) return <ListSkeleton card />;

  const filtered = typeFilter === 'ALL' ? items : items.filter((a) => a.type === typeFilter);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:w-44"><Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} options={TYPE_FILTER} /></div>
        {canAdmin && <Button onClick={() => open(null)}><Plus className="h-4 w-4" /> New Ambulance</Button>}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Truck} title="No ambulances" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Vehicle</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Driver</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const meta = AMBULANCE_STATUS_META[a.status];
                return (
                  <tr key={a.id || a._id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                    <td className="px-4 py-3 font-mono text-xs font-medium">{a.vehicleNo}</td>
                    <td className="px-4 py-3"><Badge>{a.type}</Badge></td>
                    <td className="px-4 py-3">{a.driverName || '—'} <span className="text-xs text-muted">{a.driverPhone}</span></td>
                    <td className="px-4 py-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => onViewTrips(a)} className="btn-ghost h-8 !px-2 text-xs" title="View this vehicle's trips">
                          <ListFilter className="h-4 w-4" /> Trips
                        </button>
                        {canManage && a.status === 'AVAILABLE' && (
                          <button onClick={() => {
                            setTripFor(a);
                            setTrip({ patientName: '', driverName: a.driverName || '', driverPhone: a.driverPhone || '', pickup: '', drop: '', purpose: '', charges: BASE_RATES[a.type] || '' });
                            setTripPatient(null);
                          }} className="btn-ghost h-8 !px-2 text-xs">
                            <MapPin className="h-4 w-4" /> Dispatch
                          </button>
                        )}
                        {canAdmin && (
                          <>
                            <button onClick={() => open(a)} className="btn-ghost h-8 w-8 !p-0"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => setDeleting(a)} className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} size="md" title={editing ? 'Edit Ambulance' : 'New Ambulance'}
        footer={<><Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" form="amb-f" loading={saving}>Save</Button></>}>
        <form id="amb-f" onSubmit={submit} className="grid grid-cols-2 gap-4">
          <Input label="Vehicle No *" className="uppercase" value={form.vehicleNo} onChange={(e) => setForm({ ...form, vehicleNo: e.target.value })} required />
          <Select label="Type" options={TYPE_OPTIONS} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
          <Input label="Driver Name" value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} />
          <Input label="Driver Phone" value={form.driverPhone} onChange={(e) => setForm({ ...form, driverPhone: e.target.value })} />
          {editing && <Select label="Status" options={STATUS_OPTIONS} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />}
        </form>
      </Modal>

      <Modal open={!!tripFor} onClose={() => setTripFor(null)} size="md" title={tripFor ? `Dispatch ${tripFor.vehicleNo}` : ''}
        footer={<><Button variant="outline" onClick={() => setTripFor(null)}>Cancel</Button><Button type="submit" form="trip-f" loading={saving}>Start Trip</Button></>}>
        <form id="trip-f" onSubmit={dispatch} className="space-y-4">
          <PatientPicker value={tripPatient} onChange={setTripPatient} />
          <div className="grid grid-cols-2 gap-4">
            <Input className="col-span-2" label="Patient / Caller name" placeholder="Used if not a registered patient" value={trip.patientName || ''} onChange={(e) => setTrip({ ...trip, patientName: e.target.value })} />
            <Input label="Driver" value={trip.driverName || ''} onChange={(e) => setTrip({ ...trip, driverName: e.target.value })} />
            <Input label="Driver Phone" value={trip.driverPhone || ''} onChange={(e) => setTrip({ ...trip, driverPhone: e.target.value })} />
            <Input label="Pickup" value={trip.pickup || ''} onChange={(e) => setTrip({ ...trip, pickup: e.target.value })} />
            <Input label="Drop" value={trip.drop || ''} onChange={(e) => setTrip({ ...trip, drop: e.target.value })} />
            <Input label="Purpose" value={trip.purpose || ''} onChange={(e) => setTrip({ ...trip, purpose: e.target.value })} />
            <Input label="Charges ₹" type="number" value={trip.charges || ''} onChange={(e) => setTrip({ ...trip, charges: e.target.value })} />
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={del} title="Delete ambulance?" message={deleting ? `Delete ${deleting.vehicleNo}?` : ''} confirmLabel="Delete" />
    </div>
  );
}

const TRIP_STATUS_FILTER = [{ value: 'ALL', label: 'All status' },
  ...Object.entries(TRIP_STATUS_META).map(([value, m]) => ({ value, label: m.label }))];

function EditTripModal({ trip, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (trip) setForm({ driverName: trip.driverName || '', driverPhone: trip.driverPhone || '', pickup: trip.pickup || '', drop: trip.drop || '', purpose: trip.purpose || '', charges: trip.charges || '' });
  }, [trip]);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await updateTrip(trip.id || trip._id, { ...form, charges: Number(form.charges) || 0 }); toast.success('Trip updated'); onSaved(); onClose(); }
    catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };
  return (
    <Modal open={!!trip} onClose={onClose} size="md" title={trip ? `Edit Trip · ${trip.tripNo}` : ''}
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" form="edit-trip-f" loading={saving}>Save</Button></>}>
      <form id="edit-trip-f" onSubmit={submit} className="grid grid-cols-2 gap-4">
        <Input label="Driver" value={form.driverName || ''} onChange={(e) => setForm({ ...form, driverName: e.target.value })} />
        <Input label="Driver Phone" value={form.driverPhone || ''} onChange={(e) => setForm({ ...form, driverPhone: e.target.value })} />
        <Input label="Pickup" value={form.pickup || ''} onChange={(e) => setForm({ ...form, pickup: e.target.value })} />
        <Input label="Drop" value={form.drop || ''} onChange={(e) => setForm({ ...form, drop: e.target.value })} />
        <Input label="Purpose" value={form.purpose || ''} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
        <Input label="Charges ₹" type="number" value={form.charges || ''} onChange={(e) => setForm({ ...form, charges: e.target.value })} />
      </form>
    </Modal>
  );
}

function Trips({ canManage, onChanged, initialAmbulance, onConsumedInitialAmbulance }) {
  const toast = useToast();
  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 20 } });
  const [ambulances, setAmbulances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [ambulance, setAmbulance] = useState(initialAmbulance || '');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(null);
  const [exporting, setExporting] = useState(null);
  const [editingTrip, setEditingTrip] = useState(null);
  const debounceRef = useRef();

  useEffect(() => {
    if (initialAmbulance) onConsumedInitialAmbulance?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try { setData(await listTrips({ page, limit: 20, search, status, ambulance: ambulance || undefined })); }
    catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, [page, search, status, ambulance, toast]);
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { listAmbulances().then(setAmbulances).catch(() => setAmbulances([])); }, []);

  const onSearch = (e) => { const v = e.target.value; clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => { setPage(1); setSearch(v); }, 350); };
  const onExport = async (format) => {
    setExporting(format);
    try { await exportTrips({ search, status, ambulance: ambulance || undefined }, format); }
    catch (err) { toast.error(err.message || 'Export failed'); } finally { setExporting(null); }
  };
  const close = async (t, s) => {
    const id = t.id || t._id;
    setBusy(id);
    try { await endTrip(id, s); toast.success(`Trip ${s}`); fetchData(); onChanged(); }
    catch (e) { toast.error(e.message); } finally { setBusy(null); }
  };

  const ambulanceOptions = [{ value: '', label: 'All vehicles' }, ...ambulances.map((a) => ({ value: a.id || a._id, label: a.vehicleNo }))];
  const { items, pagination } = data;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input pl-9" placeholder="Search by patient, trip no or vehicle…" onChange={onSearch} defaultValue={search} />
          </div>
          <div className="w-full sm:w-44"><Select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} options={TRIP_STATUS_FILTER} /></div>
          <div className="w-full sm:w-44"><Select value={ambulance} onChange={(e) => { setPage(1); setAmbulance(e.target.value); }} options={ambulanceOptions} /></div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" loading={exporting === 'csv'} disabled={!!exporting} onClick={() => onExport('csv')}><Download className="h-4 w-4" /> CSV</Button>
          <Button variant="outline" loading={exporting === 'xlsx'} disabled={!!exporting} onClick={() => onExport('xlsx')}><Download className="h-4 w-4" /> Excel</Button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? <ListSkeleton /> : items.length === 0 ? (
          <EmptyState icon={MapPin} title={search || ambulance || status !== 'ALL' ? 'No trips match your filters' : 'No trips'} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">Trip No</th>
                    <th className="px-4 py-3 font-medium">Vehicle</th>
                    <th className="px-4 py-3 font-medium">Patient</th>
                    <th className="px-4 py-3 font-medium">Route</th>
                    <th className="px-4 py-3 font-medium">Charges</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => {
                    const meta = TRIP_STATUS_META[t.status];
                    const id = t.id || t._id;
                    return (
                      <tr key={id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                        <td className="px-4 py-3 font-mono text-xs">{t.tripNo}</td>
                        <td className="px-4 py-3">{t.ambulance?.vehicleNo}</td>
                        <td className="px-4 py-3">{t.patient ? `${t.patient.firstName} ${t.patient.lastName}` : (t.patientName || '—')}</td>
                        <td className="px-4 py-3 text-muted">{t.pickup || '—'} → {t.drop || '—'}</td>
                        <td className="px-4 py-3 tabular-nums">{money(t.charges)}</td>
                        <td className="px-4 py-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => downloadTripReceiptPdf(id, t.tripNo).catch((e) => toast.error(e.message || 'PDF failed'))}
                              className="btn-ghost h-8 w-8 !p-0" title="Download receipt"><FileDown className="h-4 w-4" /></button>
                            {canManage && t.status === 'ONGOING' && (
                              <>
                                <button onClick={() => setEditingTrip(t)} className="btn-ghost h-8 w-8 !p-0" title="Edit trip"><Pencil className="h-4 w-4" /></button>
                                <button onClick={() => close(t, 'COMPLETED')} disabled={busy === id} className="rounded-lg border border-green-500/30 px-2 py-1 text-xs text-green-600 hover:bg-green-500/10 dark:text-green-400">
                                  <CheckCircle2 className="inline h-3.5 w-3.5" /> Complete
                                </button>
                                <button onClick={() => close(t, 'CANCELLED')} disabled={busy === id} className="rounded-lg border border-red-500/30 px-2 py-1 text-xs text-red-500 hover:bg-red-500/10">
                                  <XCircle className="inline h-3.5 w-3.5" /> Cancel
                                </button>
                              </>
                            )}
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
      <EditTripModal trip={editingTrip} onClose={() => setEditingTrip(null)} onSaved={fetchData} />
    </div>
  );
}

export default function Ambulance() {
  const { role } = useAuth();
  const canManage = CAN_AMBULANCE_MANAGE.includes(role);
  const canAdmin = CAN_MANAGE_ADMIN.includes(role);
  const [tab, setTab] = useState('Fleet');
  const [stats, setStats] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [tripsAmbulanceFilter, setTripsAmbulanceFilter] = useState('');
  const loadStats = useCallback(() => getAmbulanceStats().then(setStats).catch(() => {}), []);
  useEffect(() => { loadStats(); }, [loadStats, refresh, tab]);

  const viewTrips = (ambulance) => {
    setTripsAmbulanceFilter(ambulance.id || ambulance._id);
    setTab('Trips');
  };

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <h1 className="text-xl font-semibold">Ambulance</h1>
        <p className="mt-0.5 text-sm text-muted">Fleet and trip management.</p>
      </div>
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
          <Card className="!p-4"><p className="text-xs text-muted">Total</p><p className="mt-1 text-2xl font-semibold">{stats.total}</p></Card>
          <Card className="!p-4"><p className="text-xs text-muted">Available</p><p className="mt-1 text-2xl font-semibold text-green-600 dark:text-green-400">{stats.available}</p></Card>
          <Card className="!p-4"><p className="text-xs text-muted">Maintenance</p><p className="mt-1 text-2xl font-semibold text-amber-600 dark:text-amber-400">{stats.maintenance}</p></Card>
          <Card className="!p-4"><p className="text-xs text-muted">Ongoing Trips</p><p className="mt-1 text-2xl font-semibold">{stats.ongoing}</p></Card>
          <Card className="!p-4"><p className="text-xs text-muted">Trips Today</p><p className="mt-1 text-2xl font-semibold">{stats.tripsToday}</p></Card>
          <Card className="!p-4"><p className="text-xs text-muted">Revenue (Month)</p><p className="mt-1 text-2xl font-semibold">{money(stats.revenueThisMonth)}</p></Card>
        </div>
      )}
      <div className="flex gap-1 border-b border-border">
        {['Fleet', 'Trips'].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={'rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ' + (tab === t ? 'border-b-2 border-fg text-fg' : 'text-muted hover:text-fg')}>{t}</button>
        ))}
      </div>
      {tab === 'Fleet'
        ? <Fleet key={refresh} canManage={canManage} canAdmin={canAdmin} onChanged={() => setRefresh((r) => r + 1)} onViewTrips={viewTrips} />
        : (
          <Trips canManage={canManage} onChanged={() => setRefresh((r) => r + 1)}
            initialAmbulance={tripsAmbulanceFilter} onConsumedInitialAmbulance={() => setTripsAmbulanceFilter('')} />
        )}
    </div>
  );
}
