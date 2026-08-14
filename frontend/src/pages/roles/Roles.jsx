import { useEffect, useState } from 'react';
import { ShieldCheck, Check, Save } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Select from '../../components/ui/Select.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listRoles } from '../../services/userService.js';
import { getRoles, getPermissionCatalog, updateRolePermissions } from '../../services/roleService.js';

// Capability matrix — what each role can do across modules (mirrors backend RBAC).
// This is the human-readable summary of the enforcement in middleware/routes.
const MODULES = ['Patients', 'Appointments', 'Doctors', 'Departments', 'Users'];
const CAPS = {
  SUPER_ADMIN: { Patients: 'full', Appointments: 'full', Doctors: 'full', Departments: 'full', Users: 'full' },
  ADMIN: { Patients: 'full', Appointments: 'full', Doctors: 'full', Departments: 'full', Users: 'full' },
  DOCTOR: { Patients: 'view', Appointments: 'status', Doctors: 'view', Departments: 'view', Users: '—' },
  NURSE: { Patients: 'view', Appointments: 'status', Doctors: 'view', Departments: 'view', Users: '—' },
  RECEPTIONIST: { Patients: 'full', Appointments: 'full', Doctors: 'view', Departments: 'view', Users: '—' },
  LAB_TECHNICIAN: { Patients: '—', Appointments: '—', Doctors: '—', Departments: 'view', Users: '—' },
  RADIOLOGIST: { Patients: '—', Appointments: '—', Doctors: '—', Departments: 'view', Users: '—' },
  PHARMACIST: { Patients: '—', Appointments: '—', Doctors: '—', Departments: 'view', Users: '—' },
  ACCOUNTANT: { Patients: '—', Appointments: '—', Doctors: '—', Departments: 'view', Users: '—' },
  STORE_MANAGER: { Patients: '—', Appointments: '—', Doctors: '—', Departments: 'view', Users: '—' },
  OT_STAFF: { Patients: '—', Appointments: '—', Doctors: '—', Departments: 'view', Users: '—' },
  HR: { Patients: '—', Appointments: '—', Doctors: '—', Departments: 'view', Users: '—' },
};

const LEVEL = {
  full: { label: 'Full', tone: 'success' },
  view: { label: 'View', tone: 'neutral' },
  status: { label: 'Update', tone: 'warning' },
  '—': { label: '—', tone: null },
};

function CapCell({ level }) {
  const meta = LEVEL[level] || LEVEL['—'];
  if (!meta.tone) return <span className="text-muted/40">—</span>;
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

// Editable per-role permission matrix (dynamic RBAC — V2).
function PermissionEditor() {
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
    <Card>
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
}

export default function Roles() {
  const toast = useToast();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listRoles()
      .then(setRoles)
      .catch((err) => toast.error(err.message || 'Failed to load roles'))
      .finally(() => setLoading(false));
  }, [toast]);

  if (loading) return <Spinner full />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Roles & Permissions</h1>
        <p className="mt-0.5 text-sm text-muted">
          {roles.length} system roles. Permissions are enforced on every API — hiding a button is not security.
        </p>
      </div>

      {/* Role cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {roles.map((r) => (
          <Card key={r.name}>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-semibold">{r.name.replace(/_/g, ' ')}</h2>
            </div>
            <p className="mt-2 text-sm text-muted">{r.description}</p>
          </Card>
        ))}
      </div>

      {/* Capability matrix */}
      <Card className="!p-0">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Access Matrix (Phase 2 modules)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Role</th>
                {MODULES.map((m) => <th key={m} className="px-4 py-3 font-medium">{m}</th>)}
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => {
                const caps = CAPS[r.name] || {};
                return (
                  <tr key={r.name} className="border-b border-border/60 last:border-0 hover:bg-surface">
                    <td className="px-4 py-3 font-medium">
                      {r.name === 'SUPER_ADMIN'
                        ? <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" /> {r.name.replace(/_/g, ' ')}</span>
                        : r.name.replace(/_/g, ' ')}
                    </td>
                    {MODULES.map((m) => <td key={m} className="px-4 py-3"><CapCell level={caps[m] || '—'} /></td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-4 border-t border-border px-5 py-3 text-xs text-muted">
          <span className="flex items-center gap-1.5"><Badge tone="success">Full</Badge> create / edit / delete</span>
          <span className="flex items-center gap-1.5"><Badge tone="warning">Update</Badge> status changes only</span>
          <span className="flex items-center gap-1.5"><Badge tone="neutral">View</Badge> read-only</span>
        </div>
      </Card>

      <PermissionEditor />
    </div>
  );
}
