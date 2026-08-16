import { useEffect, useState, useCallback, useMemo } from 'react';
import QRCode from 'qrcode';
import {
  Droplet, Plus, Pencil, Trash2, Send, Ban, Search, Download, BookmarkPlus, BookmarkMinus,
  Eye, Printer, AlertTriangle, CheckCircle2, Clock,
} from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import PatientPicker from '../appointments/PatientPicker.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  getStock, listUnits, getUnit, collectUnit, issueUnit, reserveUnit, unreserveUnit, discardUnit,
  listDonors, createDonor, updateDonor, deleteDonor,
} from '../../services/bloodBankService.js';
import { listAdmissions } from '../../services/ipdService.js';
import { isCompatible } from '../../utils/bloodCompat.js';
import {
  CAN_BLOOD_MANAGE, BLOOD_GROUP_LIST, BLOOD_GROUP_SELECT, BLOOD_COMPONENT_OPTIONS, UNIT_STATUS_META,
  formatDate, formatDateTime, money,
} from '../../utils/constants.js';

const REASON_OPTIONS = ['Surgery', 'Transfusion', 'Emergency', 'Other'].map((v) => ({ value: v, label: v }));
const GROUP_FILTER = [{ value: 'ALL', label: 'All groups' }, ...BLOOD_GROUP_SELECT];
const COMPONENT_FILTER = [{ value: 'ALL', label: 'All components' }, ...BLOOD_COMPONENT_OPTIONS];

function toCsv(rows, headers) {
  const lines = [headers.map((h) => h.label).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => `"${String(h.value(row) ?? '').replace(/"/g, '""')}"`).join(','));
  }
  return lines.join('\n');
}
function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function Stock({ refreshKey }) {
  const toast = useToast();
  const [stock, setStock] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    getStock().then(setStock).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);
  if (loading) return <Spinner full />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Card className="!p-4"><p className="text-xs text-muted">Available Units</p><p className="mt-1 text-2xl font-semibold">{stock.totalAvailable}</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Donors</p><p className="mt-1 text-2xl font-semibold">{stock.donors}</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Expiring (7d)</p><p className={'mt-1 text-2xl font-semibold ' + (stock.expiringSoon ? 'text-amber-500' : '')}>{stock.expiringSoon}</p></Card>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BLOOD_GROUP_LIST.map((g) => {
          const c = stock.byGroup[g]?.total || 0;
          const tone = c === 0 ? 'text-red-500' : c < 3 ? 'text-amber-500' : '';
          return (
            <Card key={g} className="!p-4 text-center">
              <p className="text-2xl font-bold">{g}</p>
              <p className={'mt-1 text-lg font-semibold tabular-nums ' + tone}>{c}</p>
              <p className="text-xs text-muted">{c === 0 ? 'out of stock' : c < 3 ? 'low stock' : 'units'}</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// Shows a compatibility banner for the selected unit + patient, and (when
// incompatible) requires an explicit override before Issue is allowed.
function CompatibilityBanner({ unit, patient, override, onOverrideChange }) {
  if (!patient) return null;
  const recipientGroup = patient.bloodGroup;
  if (!recipientGroup || recipientGroup === 'UNKNOWN') {
    return (
      <div className="col-span-2 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
        <AlertTriangle className="h-4 w-4 shrink-0" /> Patient's blood group is not on record — compatibility can't be checked automatically.
      </div>
    );
  }
  const ok = isCompatible(unit.bloodGroup, recipientGroup);
  if (ok) {
    return (
      <div className="col-span-2 flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-600 dark:text-green-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" /> {unit.bloodGroup} is compatible with recipient's blood group ({recipientGroup}).
      </div>
    );
  }
  return (
    <div className="col-span-2 space-y-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
      <p className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /> {unit.bloodGroup} is <strong>not compatible</strong> with recipient's blood group ({recipientGroup}). This is a basic ABO/Rh check, not a lab cross-match.</p>
      <label className="flex items-center gap-2 font-medium">
        <input type="checkbox" checked={override} onChange={(e) => onOverrideChange(e.target.checked)} />
        I've confirmed with the lab — issue anyway
      </label>
    </div>
  );
}

function IssueModal({ unit, onClose, onSaved }) {
  const toast = useToast();
  const [patient, setPatient] = useState(null);
  const [reason, setReason] = useState('Transfusion');
  const [admission, setAdmission] = useState('');
  const [admissions, setAdmissions] = useState([]);
  const [chargeAmount, setChargeAmount] = useState('');
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPatient(null); setReason('Transfusion'); setAdmission(''); setAdmissions([]); setChargeAmount(''); setOverride(false);
  }, [unit]);

  useEffect(() => {
    if (!patient) { setAdmissions([]); setAdmission(''); return; }
    listAdmissions({ patient: patient.id || patient._id, status: 'ADMITTED', limit: 5 })
      .then(({ items }) => setAdmissions(items))
      .catch(() => setAdmissions([])); // no IPD access for this role — silently skip
  }, [patient]);

  if (!unit) return null;
  const recipientGroup = patient?.bloodGroup;
  const incompatible = patient && recipientGroup && recipientGroup !== 'UNKNOWN' && !isCompatible(unit.bloodGroup, recipientGroup);
  const canSubmit = !!patient && !!reason && (!incompatible || override);

  const submit = async () => {
    setBusy(true);
    try {
      await issueUnit(unit.id || unit._id, {
        patient: patient.id || patient._id,
        admission: admission || undefined,
        reason,
        chargeAmount: chargeAmount ? Number(chargeAmount) : undefined,
        overrideCompatibility: override,
      });
      toast.success('Unit issued');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!unit}
      onClose={onClose}
      size="md"
      title={`Issue ${unit.unitNo} (${unit.bloodGroup})`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy} disabled={!canSubmit}>Issue</Button></>}
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2"><PatientPicker value={patient} onChange={setPatient} /></div>
        <CompatibilityBanner unit={unit} patient={patient} override={override} onOverrideChange={setOverride} />
        <Select label="Reason *" options={REASON_OPTIONS} value={reason} onChange={(e) => setReason(e.target.value)} />
        <Input label="Charge Amount (₹)" type="number" min="0" value={chargeAmount} onChange={(e) => setChargeAmount(e.target.value)} placeholder="Optional" />
        {admissions.length > 0 && (
          <Select
            className="col-span-2" label="Link to Admission (optional)" placeholder="None"
            options={admissions.map((a) => ({ value: a.id || a._id, label: `${a.admissionNo} · ${a.ward?.name || ''}` }))}
            value={admission} onChange={(e) => setAdmission(e.target.value)}
          />
        )}
      </div>
    </Modal>
  );
}

function UnitDetailModal({ unitId, onClose }) {
  const toast = useToast();
  const [unit, setUnit] = useState(null);
  useEffect(() => {
    if (!unitId) { setUnit(null); return; }
    getUnit(unitId).then(setUnit).catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);
  const meta = unit && UNIT_STATUS_META[unit.status];
  return (
    <Modal open={!!unitId} onClose={onClose} size="md" title={unit ? `Unit ${unit.unitNo}` : 'Unit'}>
      {!unit ? <Spinner /> : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div><p className="text-xs text-muted">Blood Group</p><p className="font-medium">{unit.bloodGroup}</p></div>
          <div><p className="text-xs text-muted">Component</p><p className="font-medium">{unit.component?.replace(/_/g, ' ')}</p></div>
          <div><p className="text-xs text-muted">Status</p><Badge tone={meta.tone}>{meta.label}</Badge></div>
          <div><p className="text-xs text-muted">Donor</p><p className="font-medium">{unit.donor?.name || 'Anonymous / camp'}</p></div>
          <div><p className="text-xs text-muted">Collected</p><p className="font-medium">{formatDate(unit.collectionDate)}</p></div>
          <div><p className="text-xs text-muted">Expiry</p><p className="font-medium">{formatDate(unit.expiryDate)}</p></div>
          {unit.status === 'RESERVED' && (
            <div className="col-span-2"><p className="text-xs text-muted">Reserved For</p><p className="font-medium">{unit.reservedFor?.firstName} {unit.reservedFor?.lastName} ({unit.reservedFor?.uhid}) · {formatDateTime(unit.reservedAt)}</p></div>
          )}
          {unit.status === 'ISSUED' && (
            <>
              <div className="col-span-2"><p className="text-xs text-muted">Issued To</p><p className="font-medium">{unit.issuedTo?.firstName} {unit.issuedTo?.lastName} ({unit.issuedTo?.uhid})</p></div>
              <div><p className="text-xs text-muted">Issued At</p><p className="font-medium">{formatDateTime(unit.issuedAt)}</p></div>
              <div><p className="text-xs text-muted">Issued By</p><p className="font-medium">{unit.issuedBy?.name || '—'}</p></div>
              <div><p className="text-xs text-muted">Reason</p><p className="font-medium">{unit.reason || '—'}</p></div>
              {unit.admission && <div><p className="text-xs text-muted">Admission</p><p className="font-medium">{unit.admission.admissionNo}</p></div>}
              {unit.chargeAmount > 0 && <div><p className="text-xs text-muted">Charge</p><p className="font-medium">{money(unit.chargeAmount)}</p></div>}
            </>
          )}
          <div><p className="text-xs text-muted">Collected By</p><p className="font-medium">{unit.createdBy?.name || '—'}</p></div>
        </div>
      )}
    </Modal>
  );
}

// Printable bag label — hidden on screen, shown only in the print stylesheet.
function UnitLabel({ unit }) {
  const [qr, setQr] = useState('');
  useEffect(() => {
    if (!unit?.unitNo) return;
    QRCode.toDataURL(unit.unitNo, { margin: 1, width: 180 }).then(setQr).catch(() => setQr(''));
  }, [unit?.unitNo]);
  if (!unit) return null;
  return (
    <div className="hidden print:block">
      <div className="mx-auto w-[85mm] rounded-xl border border-black p-4 text-black">
        <p className="text-center text-xs font-semibold uppercase tracking-widest">Hospital Management System</p>
        <p className="text-center text-[10px] uppercase tracking-widest text-neutral-600">Blood Unit Label</p>
        <div className="my-3 border-t border-black" />
        <div className="flex items-center gap-3">
          {qr && <img src={qr} alt="" className="h-20 w-20 shrink-0" />}
          <div>
            <p className="text-2xl font-bold">{unit.bloodGroup}</p>
            <p className="font-mono text-sm">{unit.unitNo}</p>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
          <p><span className="text-neutral-600">Component:</span> {unit.component?.replace(/_/g, ' ')}</p>
          <p><span className="text-neutral-600">Collected:</span> {formatDate(unit.collectionDate)}</p>
          <p className="col-span-2"><span className="text-neutral-600">Expiry:</span> {formatDate(unit.expiryDate)}</p>
        </div>
        <div className="my-3 border-t border-black" />
        <p className="text-center text-[10px] text-neutral-600">Store per component guidelines. Scan to verify unit number.</p>
      </div>
    </div>
  );
}

function Units({ canManage, onChanged }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('AVAILABLE');
  const [bloodGroup, setBloodGroup] = useState('ALL');
  const [component, setComponent] = useState('ALL');
  const [issuing, setIssuing] = useState(null);
  const [reserving, setReserving] = useState(null);
  const [reservePatient, setReservePatient] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [printUnit, setPrintUnit] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await listUnits({ status, bloodGroup, component })); }
    catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [status, bloodGroup, component, toast]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!printUnit) return;
    const t = setTimeout(() => window.print(), 150); // let the QR image paint first
    return () => clearTimeout(t);
  }, [printUnit]);

  const doDiscard = async (u) => { try { await discardUnit(u.id || u._id); toast.success('Discarded'); load(); onChanged(); } catch (e) { toast.error(e.message); } };
  const doUnreserve = async (u) => { try { await unreserveUnit(u.id || u._id); toast.success('Reservation released'); load(); onChanged(); } catch (e) { toast.error(e.message); } };
  const doReserve = async () => {
    if (!reservePatient || !reserving) return;
    setBusy(true);
    try { await reserveUnit(reserving.id || reserving._id, reservePatient.id || reservePatient._id); toast.success('Unit reserved'); setReserving(null); setReservePatient(null); load(); onChanged(); }
    catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  // The soonest-to-expire AVAILABLE unit per blood group — nudges FEFO usage.
  const fefoIds = useMemo(() => {
    const seen = new Set(); const ids = new Set();
    for (const u of items) {
      if (u.status !== 'AVAILABLE') continue;
      if (seen.has(u.bloodGroup)) continue;
      seen.add(u.bloodGroup); ids.add(u.id || u._id);
    }
    return ids;
  }, [items]);

  if (loading) return <Spinner full />;
  const filter = [{ value: 'ALL', label: 'All' }, ...Object.entries(UNIT_STATUS_META).map(([v, m]) => ({ value: v, label: m.label }))];

  const exportUnits = () => downloadCsv(`blood-units-${status.toLowerCase()}.csv`, toCsv(items, [
    { label: 'Unit No', value: (u) => u.unitNo },
    { label: 'Blood Group', value: (u) => u.bloodGroup },
    { label: 'Component', value: (u) => u.component },
    { label: 'Status', value: (u) => u.status },
    { label: 'Collected', value: (u) => formatDate(u.collectionDate) },
    { label: 'Expiry', value: (u) => formatDate(u.expiryDate) },
    { label: 'Donor', value: (u) => u.donor?.name || '' },
    { label: 'Issued To', value: (u) => u.issuedTo ? `${u.issuedTo.firstName} ${u.issuedTo.lastName} (${u.issuedTo.uhid})` : '' },
  ]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-44"><Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={filter} /></div>
        <div className="w-full sm:w-40"><Select label="Blood Group" value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} options={GROUP_FILTER} /></div>
        <div className="w-full sm:w-48"><Select label="Component" value={component} onChange={(e) => setComponent(e.target.value)} options={COMPONENT_FILTER} /></div>
        {items.length > 0 && <Button variant="outline" className="ml-auto" onClick={exportUnits}><Download className="h-4 w-4" /> Export CSV</Button>}
      </div>

      {items.length === 0 ? <EmptyState icon={Droplet} title="No units" /> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[820px] text-sm">
          <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3 font-medium">Unit No</th><th className="px-4 py-3 font-medium">Group</th><th className="px-4 py-3 font-medium">Component</th><th className="px-4 py-3 font-medium">Expiry</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 text-right font-medium">Actions</th>
          </tr></thead>
          <tbody>{items.map((u) => {
            const id = u.id || u._id;
            const meta = UNIT_STATUS_META[u.status];
            const recommended = fefoIds.has(id);
            return (
              <tr key={id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                <td className="px-4 py-3 font-mono text-xs">{u.unitNo}</td>
                <td className="px-4 py-3"><Badge>{u.bloodGroup}</Badge></td>
                <td className="px-4 py-3 text-muted">{u.component?.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3">{formatDate(u.expiryDate)}</td>
                <td className="px-4 py-3">
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  {recommended && <Badge tone="warning" className="ml-1.5"><Clock className="h-3 w-3" /> Use first</Badge>}
                  {u.issuedTo && <span className="ml-2 text-xs text-muted">→ {u.issuedTo.uhid}</span>}
                  {u.reservedFor && <span className="ml-2 text-xs text-muted">→ {u.reservedFor.uhid}</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setDetailId(id)} className="btn-ghost h-8 w-8 !p-0" title="View details"><Eye className="h-4 w-4" /></button>
                    <button onClick={() => setPrintUnit(u)} className="btn-ghost h-8 w-8 !p-0" title="Print label"><Printer className="h-4 w-4" /></button>
                    {canManage && u.status === 'AVAILABLE' && (
                      <>
                        <button onClick={() => setIssuing(u)} className="btn-ghost h-8 !px-2 text-xs"><Send className="h-4 w-4" /> Issue</button>
                        <button onClick={() => { setReserving(u); setReservePatient(null); }} className="btn-ghost h-8 w-8 !p-0" title="Reserve"><BookmarkPlus className="h-4 w-4" /></button>
                        <button onClick={() => doDiscard(u)} className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10" title="Discard"><Ban className="h-4 w-4" /></button>
                      </>
                    )}
                    {canManage && u.status === 'RESERVED' && (
                      <>
                        <button onClick={() => setIssuing(u)} className="btn-ghost h-8 !px-2 text-xs"><Send className="h-4 w-4" /> Issue</button>
                        <button onClick={() => doUnreserve(u)} className="btn-ghost h-8 w-8 !p-0" title="Release reservation"><BookmarkMinus className="h-4 w-4" /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}

      <IssueModal unit={issuing} onClose={() => setIssuing(null)} onSaved={() => { load(); onChanged(); }} />
      <UnitDetailModal unitId={detailId} onClose={() => setDetailId(null)} />
      <UnitLabel unit={printUnit} />

      <Modal
        open={!!reserving} onClose={() => setReserving(null)} size="md"
        title={reserving ? `Reserve ${reserving.unitNo} (${reserving.bloodGroup})` : ''}
        footer={<><Button variant="outline" onClick={() => setReserving(null)}>Cancel</Button><Button onClick={doReserve} loading={busy} disabled={!reservePatient}>Reserve</Button></>}
      >
        <PatientPicker value={reservePatient} onChange={setReservePatient} />
      </Modal>
    </div>
  );
}

function Donors({ canManage, onChanged }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const EMPTY = { name: '', bloodGroup: 'O+', phone: '', email: '', age: '', address: '' };
  const [form, setForm] = useState(EMPTY);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { setItems(await listDonors()); } catch (e) { toast.error(e.message); } finally { setLoading(false); } }, [toast]);
  useEffect(() => { load(); }, [load]);
  const open = (d) => { setEditing(d); setForm(d ? { name: d.name, bloodGroup: d.bloodGroup, phone: d.phone || '', email: d.email || '', age: d.age || '', address: d.address || '' } : EMPTY); setFormOpen(true); };
  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const p = { ...form, age: Number(form.age) || null };
      editing ? await updateDonor(editing.id || editing._id, p) : await createDonor(p);
      toast.success('Saved'); setFormOpen(false); load(); onChanged();
    } catch (e2) { toast.error(e2.message); } finally { setSaving(false); }
  };
  const del = async () => { try { await deleteDonor(deleting.id || deleting._id); toast.success('Deleted'); setDeleting(null); load(); onChanged(); } catch (e) { toast.error(e.message); } };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((d) => d.name?.toLowerCase().includes(q) || d.phone?.includes(q));
  }, [items, search]);

  const exportDonors = () => downloadCsv('blood-donors.csv', toCsv(filtered, [
    { label: 'Name', value: (d) => d.name },
    { label: 'Blood Group', value: (d) => d.bloodGroup },
    { label: 'Phone', value: (d) => d.phone },
    { label: 'Email', value: (d) => d.email },
    { label: 'Age', value: (d) => d.age },
    { label: 'Donations', value: (d) => d.donationCount || 0 },
    { label: 'Last Donation', value: (d) => d.lastDonation ? formatDate(d.lastDonation) : '' },
    { label: 'Eligible', value: (d) => d.eligible ? 'Yes' : 'No' },
  ]));

  if (loading) return <Spinner full />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search by name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="ml-auto flex gap-2">
          {filtered.length > 0 && <Button variant="outline" onClick={exportDonors}><Download className="h-4 w-4" /> Export CSV</Button>}
          {canManage && <Button onClick={() => open(null)}><Plus className="h-4 w-4" /> New Donor</Button>}
        </div>
      </div>
      {filtered.length === 0 ? <EmptyState icon={Droplet} title="No donors" /> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[680px] text-sm">
          <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted"><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Group</th><th className="px-4 py-3 font-medium">Phone</th><th className="px-4 py-3 font-medium">Donations</th><th className="px-4 py-3 font-medium">Last Donation</th><th className="px-4 py-3 font-medium">Eligibility</th>{canManage && <th className="px-4 py-3 text-right font-medium">Actions</th>}</tr></thead>
          <tbody>{filtered.map((d) => {
            const daysLeft = d.nextEligibleDate ? Math.max(0, Math.ceil((new Date(d.nextEligibleDate) - Date.now()) / 86400000)) : 0;
            return (
              <tr key={d.id || d._id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                <td className="px-4 py-3 font-medium">{d.name}</td>
                <td className="px-4 py-3"><Badge>{d.bloodGroup}</Badge></td>
                <td className="px-4 py-3 tabular-nums">{d.phone || '—'}</td>
                <td className="px-4 py-3 tabular-nums">{d.donationCount || 0}</td>
                <td className="px-4 py-3">{d.lastDonation ? formatDate(d.lastDonation) : '—'}</td>
                <td className="px-4 py-3">{d.eligible ? <Badge tone="success">Eligible</Badge> : <Badge tone="warning">Wait {daysLeft}d</Badge>}</td>
                {canManage && <td className="px-4 py-3"><div className="flex items-center justify-end gap-1"><button onClick={() => open(d)} className="btn-ghost h-8 w-8 !p-0"><Pencil className="h-4 w-4" /></button><button onClick={() => setDeleting(d)} className="btn-ghost h-8 w-8 !p-0 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button></div></td>}
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} size="md" title={editing ? 'Edit Donor' : 'New Donor'} footer={<><Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" form="donor-f" loading={saving}>Save</Button></>}>
        <form id="donor-f" onSubmit={submit} className="grid grid-cols-2 gap-4">
          <Input label="Name *" className="col-span-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Select label="Blood Group *" options={BLOOD_GROUP_SELECT} value={form.bloodGroup} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })} />
          <Input label="Age" type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Address" className="col-span-2" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </form>
      </Modal>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={del} title="Delete donor?" message={deleting ? `Delete ${deleting.name}?` : ''} confirmLabel="Delete" />
    </div>
  );
}

function CollectModal({ open, onClose, onSaved }) {
  const toast = useToast();
  const [donors, setDonors] = useState([]);
  const [form, setForm] = useState({ bloodGroup: 'O+', component: 'WHOLE_BLOOD', donor: '', expiryDate: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { listDonors().then(setDonors).catch(() => {}); setForm({ bloodGroup: 'O+', component: 'WHOLE_BLOOD', donor: '', expiryDate: '' }); } }, [open]);
  const submit = async (e) => { e.preventDefault(); setSaving(true); try { await collectUnit({ ...form, donor: form.donor || null }); toast.success('Unit collected'); onSaved(); onClose(); } catch (e2) { toast.error(e2.message); } finally { setSaving(false); } };
  return (
    <Modal open={open} onClose={onClose} size="md" title="Collect Blood Unit" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="collect-f" loading={saving}>Collect</Button></>}>
      <form id="collect-f" onSubmit={submit} className="grid grid-cols-2 gap-4">
        <Select label="Blood Group *" options={BLOOD_GROUP_SELECT} value={form.bloodGroup} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })} />
        <Select label="Component" options={BLOOD_COMPONENT_OPTIONS} value={form.component} onChange={(e) => setForm({ ...form, component: e.target.value })} />
        <Select className="col-span-2" label="Donor (optional)" placeholder="Anonymous / camp" options={[{ value: '', label: 'None' }, ...donors.map((d) => ({ value: d.id || d._id, label: `${d.name} (${d.bloodGroup})${d.eligible === false ? ' · not eligible yet' : ''}` }))]} value={form.donor} onChange={(e) => setForm({ ...form, donor: e.target.value })} />
        <Input className="col-span-2" type="date" label="Expiry Date *" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} required />
      </form>
    </Modal>
  );
}

export default function BloodBank() {
  const { role } = useAuth();
  const canManage = CAN_BLOOD_MANAGE.includes(role);
  const [tab, setTab] = useState('Stock');
  const [collectOpen, setCollectOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const bump = () => setRefresh((r) => r + 1);
  return (
    <div className="space-y-5">
      <div className="card flex items-center justify-between p-5 print:hidden">
        <div><h1 className="text-xl font-semibold">Blood Bank</h1><p className="mt-0.5 text-sm text-muted">Donors, stock by group, collection and issue.</p></div>
        {canManage && <Button onClick={() => setCollectOpen(true)}><Plus className="h-4 w-4" /> Collect Unit</Button>}
      </div>
      <div className="flex gap-1 border-b border-border print:hidden">{['Stock', 'Units', 'Donors'].map((t) => <button key={t} onClick={() => setTab(t)} className={'rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ' + (tab === t ? 'border-b-2 border-fg text-fg' : 'text-muted hover:text-fg')}>{t}</button>)}</div>
      <div className="print:hidden">
        {tab === 'Stock' && <Stock refreshKey={refresh} />}
        {tab === 'Units' && <Units canManage={canManage} onChanged={bump} />}
        {tab === 'Donors' && <Donors canManage={canManage} onChanged={bump} />}
      </div>
      <CollectModal open={collectOpen} onClose={() => setCollectOpen(false)} onSaved={bump} />
    </div>
  );
}
