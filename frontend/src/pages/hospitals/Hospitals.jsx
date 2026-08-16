import { useEffect, useState } from 'react';
import { Building, Plus, Power, PowerOff, Copy, Check } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getTenants, createTenant, setTenantStatus } from '../../services/tenantAdminService.js';

const SLUG_RE = /^[a-z0-9-]{2,30}$/;

function CreateModal({ onClose, onDone }) {
  const toast = useToast();
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [adminPassword, setPwd] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');

  const cleanSlug = slug.trim().toLowerCase();
  const slugValid = !cleanSlug || SLUG_RE.test(cleanSlug);

  const submit = async (e) => {
    e.preventDefault();
    if (!SLUG_RE.test(cleanSlug)) { setError('Slug must be 2-30 chars: lowercase letters, numbers, hyphen'); return; }
    setError('');
    setSaving(true);
    try {
      const res = await createTenant({ slug: cleanSlug, name, adminPassword: adminPassword || undefined });
      setCreated(res);
      onDone();
    } catch (err) {
      toast.error(err.message || 'Failed to create');
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} size="md" title="Add hospital"
      footer={created
        ? <Button onClick={onClose}>Done</Button>
        : <><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="tenant-f" loading={saving}>Create</Button></>}>
      {created ? (
        <div className="space-y-3 text-sm">
          <p className="text-green-600">✓ Hospital <span className="font-semibold">{created.tenant.name}</span> provisioned.</p>
          <div className="rounded-lg border border-border bg-elevated p-3 space-y-1">
            <p>Code: <span className="font-mono">{created.tenant.slug}</span></p>
            <p>Database: <span className="font-mono">{created.tenant.dbName}</span></p>
            <p>Admin email: <span className="font-mono">{created.admin.email}</span></p>
            <p>Admin password: <span className="font-mono">{created.admin.password}</span></p>
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-400">This password is shown once — copy it now. Have the hospital's admin change it after their first login.</p>
          <p className="text-xs text-muted">Sign in with hospital code <span className="font-mono">{created.tenant.slug}</span> and the admin credentials above.</p>
        </div>
      ) : (
        <form id="tenant-f" onSubmit={submit} className="space-y-4">
          <Input label="Hospital code (slug)" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="apollo"
            error={error || (!slugValid ? 'Lowercase letters, numbers, hyphen only' : undefined)} required />
          <Input label="Hospital name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Apollo Hospital" required />
          <Input label="Admin password (optional)" value={adminPassword} onChange={(e) => setPwd(e.target.value)} placeholder="Leave blank to auto-generate a random one" />
          <p className="text-xs text-muted">A fresh isolated database will be provisioned and seeded with roles + an admin account.</p>
        </form>
      )}
    </Modal>
  );
}

export default function Hospitals() {
  const toast = useToast();
  const [tenants, setTenants] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [copied, setCopied] = useState('');
  const [suspending, setSuspending] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => getTenants().then(setTenants).catch((e) => { toast.error(e.message || 'Failed to load'); setTenants([]); });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Suspending locks out every user at that hospital — worth a confirm.
  // Reactivating is the safe direction, so it applies immediately.
  const activate = async (t) => {
    try { await setTenantStatus(t.slug, 'ACTIVE'); toast.success(`${t.name} activated`); load(); }
    catch (e) { toast.error(e.message || 'Failed'); }
  };
  const confirmSuspend = async () => {
    setBusy(true);
    try { await setTenantStatus(suspending.slug, 'SUSPENDED'); toast.success(`${suspending.name} suspended`); setSuspending(null); load(); }
    catch (e) { toast.error(e.message || 'Failed'); } finally { setBusy(false); }
  };

  const copy = (slug) => { navigator.clipboard?.writeText(slug); setCopied(slug); setTimeout(() => setCopied(''), 1500); };

  if (tenants === null) return <Spinner full />;

  return (
    <div className="space-y-5">
      <div className="card flex items-center justify-between p-5">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><Building className="h-5 w-5" /> Hospitals</h1>
          <p className="mt-0.5 text-sm text-muted">Each hospital runs on its own isolated database. {tenants.length} registered.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Add hospital</Button>
      </div>

      {tenants.length === 0 ? (
        <EmptyState icon={Building} title="No hospitals yet" description="Add your first hospital to get started." />
      ) : (
        <Card className="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">Hospital</th>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Database</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.slug} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium">{t.name}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => copy(t.slug)} className="inline-flex items-center gap-1 font-mono text-muted hover:text-fg" title="Copy code">
                        {t.slug} {copied === t.slug ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-muted">{t.dbName}</td>
                    <td className="px-4 py-3"><Badge tone={t.status === 'ACTIVE' ? 'success' : 'danger'}>{t.status}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      {t.slug !== 'default' && (
                        <Button variant="outline" className="h-8" onClick={() => (t.status === 'ACTIVE' ? setSuspending(t) : activate(t))}>
                          {t.status === 'ACTIVE' ? <><PowerOff className="h-4 w-4" /> Suspend</> : <><Power className="h-4 w-4" /> Activate</>}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {createOpen && <CreateModal onClose={() => setCreateOpen(false)} onDone={load} />}
      <ConfirmDialog open={!!suspending} onClose={() => setSuspending(null)} onConfirm={confirmSuspend} loading={busy}
        title="Suspend hospital?" confirmLabel="Suspend"
        message={suspending ? `${suspending.name}'s staff will be immediately locked out of their accounts. You can reactivate it later.` : ''} />
    </div>
  );
}
