import { useEffect, useMemo, useRef, useState, forwardRef } from 'react';
import { ShieldCheck, Crown, Check, Save } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Select from '../../components/ui/Select.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listRoles, getUserStats } from '../../services/userService.js';
import { getRoles, getPermissionCatalog, updateRolePermissions } from '../../services/roleService.js';
import { NAV_ITEMS } from '../../utils/navigation.js';
import { cn } from '../../utils/cn.js';

// Modules visible to *everyone* (empty roles array) aren't useful in a
// role-comparison matrix — every column would just be a checkmark.
const MATRIX_ITEMS = NAV_ITEMS.filter((i) => i.roles.length > 0);

function hasAccess(item, roleName) {
  return roleName === 'SUPER_ADMIN' || item.roles.includes(roleName);
}

// Editable per-role permission matrix (dynamic RBAC — V2).
const PermissionEditor = forwardRef(function PermissionEditor({ focusRole }, ref) {
  const toast = useToast();
  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState({ modules: [], actions: [] });
  const [selected, setSelected] = useState('');
  const [perms, setPerms] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getRoles(), getPermissionCatalog()])
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

  const toggle = (key) => setPerms((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateRolePermissions(selected, [...perms]);
      setRoles((rs) => rs.map((r) => (r.name === selected ? { ...r, permissions: updated.permissions } : r)));
      toast.success('Permissions saved');
    } catch (e) { toast.error(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  if (loading) return null;
  const isSuper = selected === 'SUPER_ADMIN';

  return (
    <Card ref={ref}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Custom Permissions (editable)</h2>
          <p className="mt-0.5 text-xs text-muted">Fine-grained module permissions per role. Stored on the role and surfaced to the app; route enforcement remains role-based.</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="w-52">
            <Select label="Role" value={selected} onChange={(e) => onSelect(e.target.value)}
              options={roles.map((r) => ({ value: r.name, label: r.name.replace(/_/g, ' ') }))} />
          </div>
          <Button onClick={save} loading={saving} disabled={isSuper}><Save className="h-4 w-4" /> Save</Button>
        </div>
      </div>

      {isSuper ? (
        <p className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-muted">SUPER_ADMIN always has full access — not editable.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Module</th>
                {catalog.actions.map((a) => <th key={a} className="py-2 px-3 text-center font-medium capitalize">{a}</th>)}
              </tr>
            </thead>
            <tbody>
              {catalog.modules.map((m) => (
                <tr key={m.key} className="border-b border-border/60">
                  <td className="py-2 pr-3 font-medium">{m.label}</td>
                  {catalog.actions.map((a) => {
                    const key = `${m.key}:${a}`;
                    return (
                      <td key={a} className="py-2 px-3 text-center">
                        <input type="checkbox" className="h-4 w-4" checked={perms.has(key)} onChange={() => toggle(key)} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
    listRoles()
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

  if (loading) return <Spinner full />;

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
                  isSuper ? 'bg-accent text-accent-fg' : 'border border-border bg-surface'
                )}>
                  {isSuper ? <Crown className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                </span>
                <Badge tone={userCounts[r.name] ? 'neutral' : 'warning'}>
                  {userCounts[r.name] || 0} user{userCounts[r.name] === 1 ? '' : 's'}
                </Badge>
              </div>
              <h2 className="mt-3 text-sm font-semibold">{r.name.replace(/_/g, ' ')}</h2>
              <p className="mt-1 line-clamp-2 text-xs text-muted">{r.description}</p>
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
                      {hasAccess(item, r.name) ? <Check className="mx-auto h-4 w-4 text-green-600 dark:text-green-400" /> : <span className="text-muted/30">—</span>}
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
