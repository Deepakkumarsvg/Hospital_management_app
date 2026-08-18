import { useCallback, useEffect, useMemo, useState } from 'react';
import { IndianRupee, Plus, Pencil, Trash2, Star } from 'lucide-react';
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
  listPlans, createPlan, updatePlan, makeDefault, deletePlan, listRates, setRate,
} from '../../services/tariffService.js';
import { activeLabTests } from '../../services/labService.js';
import { money } from '../../utils/constants.js';

const EMPTY = { name: '', code: '', description: '', baseAdjustmentPercent: 0, status: 'ACTIVE' };

// A plan's blanket adjustment reads as a discount far more often than as a
// premium, so it is shown the way a contract is actually worded.
function adjustmentLabel(percent) {
  if (!percent) return 'List price';
  return percent < 0 ? `List − ${Math.abs(percent)}%` : `List + ${percent}%`;
}

function PlanForm({ open, plan, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(plan ? {
      name: plan.name, code: plan.code, description: plan.description || '',
      baseAdjustmentPercent: plan.baseAdjustmentPercent || 0, status: plan.status,
    } : EMPTY);
  }, [open, plan]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) { toast.error('Name and code are required'); return; }
    setSaving(true);
    try {
      const payload = { ...form, baseAdjustmentPercent: Number(form.baseAdjustmentPercent) || 0 };
      if (plan) await updatePlan(plan.id || plan._id, payload);
      else await createPlan(payload);
      toast.success('Saved'); onSaved(); onClose();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} size="md" title={plan ? `Edit ${plan.name}` : 'New tariff plan'}
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" form="plan-f" loading={saving}>Save</Button></>}>
      <form id="plan-f" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Name *" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="CGHS" />
          <Input label="Code *" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())}
            placeholder="CGHS" disabled={!!plan} />
        </div>
        <Input label="Description" value={form.description} onChange={(e) => set('description', e.target.value)}
          placeholder="Central Government Health Scheme panel" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Blanket adjustment (%)" type="number" value={form.baseAdjustmentPercent}
            onChange={(e) => set('baseAdjustmentPercent', e.target.value)} placeholder="-20" />
          <Select label="Status" value={form.status} onChange={(e) => set('status', e.target.value)}
            options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]} />
        </div>
        <p className="text-xs text-muted">
          The adjustment applies to any service this plan does not price explicitly — most contracts
          are “the standard list, minus a percentage” with a handful of negotiated exceptions.
          Use a negative number for a discount.
        </p>
      </form>
    </Modal>
  );
}

// The negotiated exceptions for one plan. Only lab tests for now — the same
// screen shape extends to the other service types as their catalogues are
// wired in.
function RatesModal({ plan, onClose }) {
  const toast = useToast();
  const [tests, setTests] = useState([]);
  const [rates, setRates] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    if (!plan) return;
    setLoading(true);
    try {
      const [catalogue, existing] = await Promise.all([
        activeLabTests(),
        listRates(plan.id || plan._id, 'LAB_TEST'),
      ]);
      setTests(catalogue);
      setRates(Object.fromEntries(existing.map((r) => [String(r.service), r.price])));
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, [plan, toast]);

  useEffect(() => { load(); }, [load]);

  const save = async (testId, raw) => {
    setSavingId(testId);
    try {
      // Blank clears the override back to the blanket adjustment — which is a
      // different thing from pricing the service at zero.
      const price = raw === '' ? null : Number(raw);
      await setRate(plan.id || plan._id, { serviceType: 'LAB_TEST', service: testId, price });
      setRates((r) => {
        const next = { ...r };
        if (price === null) delete next[testId]; else next[testId] = price;
        return next;
      });
      toast.success(price === null ? 'Override removed' : 'Rate saved');
    } catch (e) { toast.error(e.message); } finally { setSavingId(null); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? tests.filter((t) => t.name.toLowerCase().includes(q) || t.code?.toLowerCase().includes(q)) : tests;
  }, [tests, search]);

  const adjusted = (listPrice) => Math.max(0, Math.round(listPrice * (1 + (plan?.baseAdjustmentPercent || 0) / 100)));

  return (
    <Modal open={!!plan} onClose={onClose} size="2xl" title={plan ? `Rates · ${plan.name}` : ''}
      footer={<Button variant="outline" onClick={onClose}>Done</Button>}>
      <div className="space-y-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tests…" />

        {loading ? <ListSkeleton /> : filtered.length === 0 ? (
          <EmptyState title="No tests" description="Add lab tests before setting rates for them." />
        ) : (
          <div className="max-h-[55vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Test</th>
                  <th className="px-3 py-2 text-right font-medium">List</th>
                  <th className="px-3 py-2 text-right font-medium">Plan default</th>
                  <th className="px-3 py-2 text-right font-medium">Negotiated</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const id = t.id || t._id;
                  const override = rates[id];
                  return (
                    <tr key={id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2">{t.name} <span className="text-xs text-muted">{t.code}</span></td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{money(t.price)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{money(adjusted(t.price))}</td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          className="w-28 text-right"
                          defaultValue={override ?? ''}
                          placeholder="—"
                          disabled={savingId === id}
                          onBlur={(e) => {
                            const v = e.target.value;
                            if (String(override ?? '') !== v) save(id, v);
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted">
          Leave a row blank to use the plan default. A negotiated rate of 0 means the plan covers
          that test in full — which is not the same as leaving it blank.
        </p>
      </div>
    </Modal>
  );
}

export default function TariffPlans() {
  const { can } = useAuth();
  const toast = useToast();
  const canManage = can('tariffs:manage');

  const [plans, setPlans] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [ratesFor, setRatesFor] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    try { setPlans(await listPlans()); }
    catch (e) { toast.error(e.message); setPlans([]); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const setDefault = async (plan) => {
    try {
      await makeDefault(plan.id || plan._id);
      toast.success(`${plan.name} is now the default`);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const remove = async () => {
    try {
      await deletePlan(deleting.id || deleting._id);
      toast.success('Plan deleted'); setDeleting(null); load();
    } catch (e) { toast.error(e.message); setDeleting(null); }
  };

  if (!plans) return <ListSkeleton card />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tariff Plans</h1>
          <p className="mt-1 text-sm text-muted">
            What each payer is charged. A patient on no plan is billed at the default.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> New plan
          </Button>
        )}
      </div>

      {plans.length === 0 ? (
        <Card>
          <EmptyState
            icon={IndianRupee}
            title="No tariff plans yet"
            description="Create one plan per payer — cash, CGHS, each corporate contract and TPA panel."
          />
        </Card>
      ) : (
        <Card className="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Pricing</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id || p._id} className="border-b border-border/60 last:border-0 hover:bg-surface">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.name}</span>
                        {p.isDefault && <Badge tone="success">Default</Badge>}
                      </div>
                      {p.description && <p className="mt-0.5 text-xs text-muted">{p.description}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{p.code}</td>
                    <td className="px-4 py-3 text-muted">{adjustmentLabel(p.baseAdjustmentPercent)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={p.status === 'ACTIVE' ? 'success' : 'neutral'}>{p.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setRatesFor(p)} className="btn-ghost h-8 px-2 text-xs" title="Negotiated rates">
                          Rates
                        </button>
                        {canManage && !p.isDefault && p.status === 'ACTIVE' && (
                          <button onClick={() => setDefault(p)} className="btn-ghost h-8 w-8 !p-0" title="Make default">
                            <Star className="h-4 w-4" />
                          </button>
                        )}
                        {canManage && (
                          <button onClick={() => { setEditing(p); setFormOpen(true); }} className="btn-ghost h-8 w-8 !p-0" title="Edit">
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {canManage && !p.isDefault && (
                          <button onClick={() => setDeleting(p)} className="btn-ghost h-8 w-8 !p-0" title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <PlanForm open={formOpen} plan={editing} onClose={() => setFormOpen(false)} onSaved={load} />
      <RatesModal plan={ratesFor} onClose={() => setRatesFor(null)} />
      <ConfirmDialog
        open={!!deleting}
        title="Delete tariff plan?"
        message={deleting ? `${deleting.name} will be removed along with its negotiated rates. Patients on it must be moved first.` : ''}
        confirmLabel="Delete"
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
