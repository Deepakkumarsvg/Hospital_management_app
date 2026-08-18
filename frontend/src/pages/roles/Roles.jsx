import { useEffect, useMemo, useRef, useState, forwardRef } from 'react';
import { ShieldCheck, Crown, Check, Save, Search, RotateCcw, X, AlertTriangle } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Select from '../../components/ui/Select.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { PageSkeleton } from '../../components/ui/Skeleton.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getUserStats } from '../../services/userService.js';
import { getRoles, getPermissionCatalog, updateRolePermissions } from '../../services/roleService.js';
import { NAV_ITEMS } from '../../utils/navigation.js';
import { cn } from '../../utils/cn.js';

// Modules open to *everyone* (perm: null - Dashboard, Settings) are not useful
// in a role-comparison matrix: every column would just be a checkmark. The
// SUPER_ADMIN-only items stay, because "only the platform operator" is exactly
// the kind of row the matrix exists to show.
const MATRIX_ITEMS = NAV_ITEMS.filter((i) => i.perm || i.superAdminOnly);

// Which section of the app each permission module belongs to.
//
// Derived from the nav wherever a module has a page, so the two can't drift as
// modules ship. A handful of modules guard capabilities rather than screens —
// clinical charting, the OPD queue, deposits, ops — so they have no nav entry
// and are placed explicitly. Anything unrecognised falls into "Other" rather
// than vanishing, which is the failure mode that matters on an access-control
// screen.
const GROUP_ORDER = ['Patient Care', 'Diagnostics', 'Pharmacy & Inventory', 'Operations', 'Finance', 'Administration', 'Other'];

const EXTRA_GROUPS = {
  clinical: 'Patient Care',
  queue: 'Patient Care',
  deposits: 'Finance',
  ops: 'Administration',
};

const NAV_GROUPS = NAV_ITEMS.reduce((acc, i) => {
  const moduleKey = i.perm?.split(':')[0];
  if (moduleKey && !acc[moduleKey]) acc[moduleKey] = i.group;
  return acc;
}, {});

const groupOf = (moduleKey) => NAV_GROUPS[moduleKey] || EXTRA_GROUPS[moduleKey] || 'Other';

// Action keys are terse on purpose — they are API strings. These are the same
// words written for a person configuring access, not for a URL.
const ACTION_LABELS = {
  mlc: 'MLC',
  bedstatus: 'Bed status',
  opd: 'OPD',
};
const actionLabel = (a) => ACTION_LABELS[a] || a.charAt(0).toUpperCase() + a.slice(1);

// Whether a role can open a module.
//
// This reads the role's real permission list rather than its name, because a
// permission list is what the server actually enforces. The nav config stopped
// carrying role arrays when the permission matrix became editable, and this
// table was still reading them - so it threw on every render, and would have
// been describing the wrong thing even if it had not.
function hasAccess(item, role) {
  // SUPER_ADMIN bypasses the matrix server-side, so it reaches everything
  // whatever its stored permission list happens to say.
  if (role.name === 'SUPER_ADMIN') return true;
  // Gated on identity rather than permission - no grant opens these.
  if (item.superAdminOnly) return false;
  return (role.permissions || []).includes(item.perm);
}

// Editable per-role permission matrix (dynamic RBAC).
//
// This screen decides what every member of staff can do, so it is worth being
// blunt about what it used to get wrong: it rendered a checkbox for every
// module crossed with every action name used ANYWHERE in the catalogue. That is
// 594 boxes, of which 73 are real permissions. The other 521 — `patients:triage`,
// `hr:prescribe`, `billing:mlc` — could be ticked and saved, and the server
// silently dropped them, because they do not exist. The screen was lying to the
// person configuring access control.
//
// Actions are declared per module, so each module now shows only its own.
// Nothing on this screen can be ticked that the API will not honour.
const PermissionEditor = forwardRef(function PermissionEditor({ focusRole }, ref) {
  const toast = useToast();
  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState({ modules: [], actions: [] });
  const [selected, setSelected] = useState('');
  const [perms, setPerms] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyGranted, setOnlyGranted] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const load = () => Promise.all([getRoles(), getPermissionCatalog()]);

  useEffect(() => {
    load()
      .then(([r, c]) => {
        setRoles(r); setCatalog(c);
        const first = r.find((x) => x.name !== 'SUPER_ADMIN') || r[0];
        if (first) { setSelected(first.name); setPerms(new Set(first.permissions)); }
      })
      .catch((e) => toast.error(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [toast]);

  const onSelect = (name) => {
    setSelected(name);
    setPerms(new Set(roles.find((r) => r.name === name)?.permissions || []));
  };

  // Jumping in from a role card picks that role here too.
  useEffect(() => {
    if (focusRole && roles.length) onSelect(focusRole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRole, roles]);

  const role = roles.find((r) => r.name === selected);
  const isSuper = selected === 'SUPER_ADMIN';

  // Only a module's OWN actions are real permissions. Every count, filter and
  // toggle below works off these rather than off the flat action union.
  const modules = useMemo(() => catalog.modules || [], [catalog.modules]);
  const totalKeys = useMemo(
    () => modules.reduce((n, m) => n + (m.actions?.length || 0), 0),
    [modules]
  );

  // What the server holds for this role right now, so the draft can be compared
  // against it. Saving when nothing changed is a write, an audit entry and a
  // cache invalidation for no reason.
  const saved = useMemo(() => new Set(role?.permissions || []), [role]);
  const { added, removed } = useMemo(() => ({
    added: [...perms].filter((p) => !saved.has(p)).length,
    removed: [...saved].filter((p) => !perms.has(p)).length,
  }), [perms, saved]);
  const dirty = added > 0 || removed > 0;

  const toggle = (key) => setPerms((s) => {
    const n = new Set(s);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  // Whole-module bulk actions. Building a role one checkbox at a time across
  // two dozen modules is the reason this screen got avoided.
  const setModule = (m, on) => setPerms((s) => {
    const n = new Set(s);
    for (const a of m.actions || []) {
      if (on) n.add(`${m.key}:${a}`); else n.delete(`${m.key}:${a}`);
    }
    return n;
  });

  // Most new roles are "the same as that one, minus a few things". This is a
  // draft change like any other — nothing is written until Save.
  const copyFrom = (name) => {
    const source = roles.find((r) => r.name === name);
    if (!source) return;
    setPerms(new Set(source.permissions || []));
    toast.success(`Copied ${source.permissions?.length || 0} permissions from ${name.replace(/_/g, ' ')}`);
  };

  // Re-reads from the server after every write rather than trusting the
  // response body. The API returns what is STORED, and an empty stored list
  // means "never configured" — which the server then resolves to the built-in
  // defaults. Stored and effective are not the same thing, and only the list
  // endpoint resolves one into the other.
  const persist = async (next, message) => {
    setSaving(true);
    try {
      await updateRolePermissions(selected, next);
      const [fresh] = await load();
      setRoles(fresh);
      setPerms(new Set(fresh.find((r) => r.name === selected)?.permissions || []));
      toast.success(message);
    } catch (e) {
      toast.error(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const save = () => persist([...perms], 'Permissions saved');
  const resetToDefaults = () => {
    setConfirmReset(false);
    return persist([], 'Reset to the built-in defaults');
  };

  const q = search.trim().toLowerCase();
  const visibleModules = modules.filter((m) => {
    const granted = (m.actions || []).filter((a) => perms.has(`${m.key}:${a}`));
    if (onlyGranted && granted.length === 0) return false;
    if (!q) return true;
    return m.label.toLowerCase().includes(q)
      || m.key.includes(q)
      || (m.actions || []).some((a) => a.includes(q));
  });

  // Twenty-nine modules in one flat list is a scroll, not a structure. These
  // are the same sections the sidebar uses, so the shape of this screen matches
  // the shape of the app the reader already knows.
  const grouped = useMemo(() => {
    const bucket = new Map();
    for (const m of visibleModules) {
      const g = groupOf(m.key);
      if (!bucket.has(g)) bucket.set(g, []);
      bucket.get(g).push(m);
    }
    return GROUP_ORDER.filter((g) => bucket.has(g)).map((g) => [g, bucket.get(g)]);
  }, [visibleModules]);

  if (loading) return null;

  return (
    <Card ref={ref} className="!p-0">
      <div className="flex flex-col gap-3 border-b border-border p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Custom Permissions</h2>
            <p className="mt-0.5 max-w-xl text-xs text-muted">
              What this role may do. Every key here is enforced on the API — this is
              access control, not which buttons get shown.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="w-48">
              <Select
                label="Editing role"
                value={selected}
                onChange={(e) => onSelect(e.target.value)}
                options={roles.map((r) => ({ value: r.name, label: r.name.replace(/_/g, ' ') }))}
              />
            </div>
            {!isSuper && (
              <div className="w-44">
                <Select
                  label="Copy from"
                  value=""
                  onChange={(e) => e.target.value && copyFrom(e.target.value)}
                  options={[
                    { value: '', label: 'Choose a role…' },
                    ...roles
                      .filter((r) => r.name !== selected && r.name !== 'SUPER_ADMIN')
                      .map((r) => ({ value: r.name, label: r.name.replace(/_/g, ' ') })),
                  ]}
                />
              </div>
            )}
          </div>
        </div>

        {!isSuper && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Whether this role runs on the built-in defaults or on something a
                person chose. Without it, "34 granted" gives no clue that nobody
                has ever touched this role. */}
            <Badge tone={role?.customised ? 'solid' : 'neutral'}>
              {role?.customised ? 'Customised' : 'Using defaults'}
            </Badge>
            <Badge tone="neutral">{perms.size} of {totalKeys} granted</Badge>

            {dirty && (
              <Badge tone="warning">
                Unsaved
                {added > 0 ? ` +${added}` : ''}
                {removed > 0 ? ` −${removed}` : ''}
              </Badge>
            )}

            <div className="ml-auto flex flex-wrap gap-2">
              {dirty && (
                <Button variant="ghost" onClick={() => onSelect(selected)} disabled={saving}>
                  <X className="h-4 w-4" /> Discard
                </Button>
              )}
              {role?.customised && (
                <Button variant="outline" onClick={() => setConfirmReset(true)} disabled={saving}>
                  <RotateCcw className="h-4 w-4" /> Reset to defaults
                </Button>
              )}
              {/* Disabled until something actually changed, so the button
                  answers "is there anything to save?" on sight. */}
              <Button onClick={save} loading={saving} disabled={!dirty}>
                <Save className="h-4 w-4" /> Save changes
              </Button>
            </div>
          </div>
        )}
      </div>

      {isSuper ? (
        <p className="m-5 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
          SUPER_ADMIN bypasses the permission matrix entirely rather than being granted
          everything in it — so a new module is never accidentally out of its reach, and
          there is nothing here to edit.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2 border-b border-border px-5 py-3 sm:flex-row sm:items-center">
            {/* Two dozen modules is more than fits on a screen. Searching for
                "pharmacy" beats scrolling for it. */}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                className="input pl-9"
                placeholder="Search modules or actions…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => setOnlyGranted((v) => !v)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                onlyGranted ? 'border-fg bg-fg text-bg' : 'border-border text-muted hover:bg-surface hover:text-fg'
              )}
            >
              Only granted
            </button>
          </div>

          {/* The single most surprising behaviour on this screen, so it is said
              out loud rather than left in a source comment. */}
          {perms.size === 0 && (
            <div className="mx-5 mt-4 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Saving with nothing granted does <strong>not</strong> lock this role out.
                An empty list reads as “never configured”, so the server falls back to the
                built-in defaults. To leave someone with no access, change their role
                instead.
              </span>
            </div>
          )}

          {visibleModules.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">
              No module matches “{search}”.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {grouped.map(([group, mods]) => (
                <div key={group}>
                  <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface/95 px-5 py-1.5 backdrop-blur">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{group}</span>
                    <span className="text-[11px] tabular-nums text-muted">
                      {mods.reduce((n, m) => n + (m.actions || []).filter((a) => perms.has(`${m.key}:${a}`)).length, 0)}
                      {' / '}
                      {mods.reduce((n, m) => n + (m.actions?.length || 0), 0)}
                    </span>
                  </div>
                  <div className="divide-y divide-border">
              {mods.map((m) => {
                const actions = m.actions || [];
                const grantedCount = actions.filter((a) => perms.has(`${m.key}:${a}`)).length;
                const all = actions.length > 0 && grantedCount === actions.length;

                return (
                  <div key={m.key} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="sm:w-52 sm:shrink-0">
                      <p className="text-sm font-medium">{m.label}</p>
                      <div className="mt-1 flex items-center gap-2">
                        {/* A bar rather than only "2 of 3": partial grants are
                            the ones worth a second look, and at a glance a
                            half-filled bar finds them faster than reading. */}
                        <span className="h-1 w-16 overflow-hidden rounded-full bg-fg/10">
                          <span
                            className={cn('block h-full rounded-full', grantedCount ? 'bg-accent' : 'bg-transparent')}
                            style={{ width: `${actions.length ? (grantedCount / actions.length) * 100 : 0}%` }}
                          />
                        </span>
                        <span className="text-xs tabular-nums text-muted">{grantedCount}/{actions.length}</span>
                      </div>
                    </div>

                    <div className="flex flex-1 flex-wrap items-center gap-1.5">
                      {/* Chips rather than bare checkboxes: the action name sits
                          on the control itself, so on a narrow screen you can
                          still tell "delete" from "view" without tracing back to
                          a column header that has scrolled out of sight. */}
                      {actions.map((a) => {
                        const key = `${m.key}:${a}`;
                        const on = perms.has(key);
                        return (
                          <button
                            key={a}
                            type="button"
                            role="switch"
                            aria-checked={on}
                            aria-label={`${m.label}: ${a}`}
                            onClick={() => toggle(key)}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                              // A fully-granted role turned every chip solid, and
                              // twenty-nine rows of solid fill is a wall you cannot
                              // read. What someone scans this screen for is the gap —
                              // the one action that ISN'T granted — so "on" is a tint
                              // that stays legible in bulk and "off" is what stands
                              // out against it. The check keeps state off colour alone.
                              on
                                ? 'border-accent/35 bg-accent/10 text-accent hover:bg-accent/20'
                                : 'border-border text-muted hover:border-fg/30 hover:text-fg'
                            )}
                          >
                            {on ? <Check className="h-3 w-3" /> : <span className="h-3 w-3" aria-hidden="true" />}
                            {actionLabel(a)}
                          </button>
                        );
                      })}

                      {actions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setModule(m, !all)}
                          className="ml-auto shrink-0 rounded-full border border-transparent px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-border hover:bg-surface hover:text-fg"
                        >
                          {all ? 'Clear all' : 'Grant all'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={resetToDefaults}
        loading={saving}
        danger={false}
        title={`Reset ${selected.replace(/_/g, ' ')} to defaults?`}
        message="Every customisation for this role is discarded and it goes back to the permissions it shipped with. This takes effect immediately for anyone signed in with that role."
        confirmLabel="Reset"
      />
    </Card>
  );
});

export default function Roles() {
  const toast = useToast();
  const [roles, setRoles] = useState([]);
  const [userCounts, setUserCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [focusRole, setFocusRole] = useState('');
  const editorRef = useRef(null);

  useEffect(() => {
    getRoles()
      .then(setRoles)
      .catch((err) => toast.error(err.message || 'Failed to load roles'))
      .finally(() => setLoading(false));
    getUserStats()
      .then((s) => setUserCounts(Object.fromEntries((s.byRole || []).map((r) => [r.role, r.count]))))
      .catch(() => {});
  }, [toast]);

  const totalUsers = useMemo(() => Object.values(userCounts).reduce((a, b) => a + b, 0), [userCounts]);

  const jumpToPermissions = (name) => {
    setFocusRole(name);
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <h1 className="text-xl font-semibold">Roles & Permissions</h1>
        <p className="mt-0.5 text-sm text-muted">
          {roles.length} system roles. Permissions are enforced on every API — hiding a button is not security.
        </p>
      </div>

      {/* Role cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {roles.map((r) => {
          const isSuper = r.name === 'SUPER_ADMIN';
          // SUPER_ADMIN bypasses the matrix server-side; PATIENT is gated by
          // requirePatient (account type + a linked profile), not by grants.
          const outsideMatrix =
            isSuper ? 'Bypasses the matrix'
            : r.name === 'PATIENT' ? 'Portal access, not matrix-governed'
            : null;
          return (
            <button
              key={r.name}
              onClick={() => jumpToPermissions(r.name)}
              className={cn(
                'card flex flex-col rounded-xl border p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md',
                isSuper ? 'border-fg/30 bg-elevated' : 'border-border bg-elevated hover:border-fg/20'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  isSuper ? 'bg-accent text-accent-fg' : 'border border-accent/15 bg-accent/10 text-accent'
                )}>
                  {isSuper ? <Crown className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                </span>
                <Badge tone={userCounts[r.name] ? 'neutral' : 'warning'}>
                  {userCounts[r.name] || 0} user{userCounts[r.name] === 1 ? '' : 's'}
                </Badge>
              </div>
              <h2 className="mt-3 text-sm font-semibold">{r.name.replace(/_/g, ' ')}</h2>
              <p className="mb-3 mt-1 line-clamp-2 text-xs text-muted">{r.description}</p>

              {/* Thirteen cards differing only by name gave no reason to click any
                  particular one. The two things worth knowing before opening a
                  role are how much it can do, and whether anyone has changed it
                  from what it shipped with. */}
              <div className="mt-auto flex items-center gap-2 border-t border-border pt-2.5">
                {outsideMatrix ? (
                  <span className="text-xs text-muted">{outsideMatrix}</span>
                ) : (
                  <>
                    <span className="text-xs tabular-nums text-muted">
                      {(r.permissions || []).length} permission{(r.permissions || []).length === 1 ? '' : 's'}
                    </span>
                    {r.customised && (
                      <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-accent">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                        Customised
                      </span>
                    )}
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Module visibility matrix — derived live from the app's own nav
          config, so it can never drift out of date the way a hand-maintained
          table would as new modules ship. */}
      <Card className="!p-0">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Module Access Matrix</h2>
          <p className="mt-0.5 text-xs text-muted">Which roles can see each module. {totalUsers} total users across all roles.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="sticky left-0 bg-elevated px-4 py-3 font-medium">Module</th>
                {roles.map((r) => (
                  <th key={r.name} className="px-3 py-3 text-center font-medium">{r.name.replace(/_/g, ' ')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX_ITEMS.map((item) => (
                <tr key={item.label} className="border-b border-border/60 last:border-0 hover:bg-surface">
                  <td className="sticky left-0 bg-elevated px-4 py-2.5 font-medium">{item.label}</td>
                  {roles.map((r) => (
                    <td key={r.name} className="px-3 py-2.5 text-center">
                      {hasAccess(item, r) ? <Check className="mx-auto h-4 w-4 text-green-600 dark:text-green-400" /> : <span className="text-muted/30">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <PermissionEditor ref={editorRef} focusRole={focusRole} />
    </div>
  );
}
