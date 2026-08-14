import { useEffect, useState } from 'react';
import { Building, Plus, Power, PowerOff, Copy, Check } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getTenants, createTenant, setTenantStatus } from '../../services/tenantAdminService.js';

function CreateModal({ onClose, onDone }) {
  const toast = useToast();
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [adminPassword, setPwd] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await createTenant({ slug: slug.trim().toLowerCase(), name, adminPassword: adminPassword || undefined });
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
          <p className="text-xs text-muted">Sign in with hospital code <span className="font-mono">{created.tenant.slug}</span> and the admin credentials above.</p>
        </div>
      ) : (
        <form id="tenant-f" onSubmit={submit} className="space-y-4">
          <Input label="Hospital code (slug)" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="apollo" required />
          <Input label="Hospital name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Apollo Hospital" required />
          <Input label="Admin password (optional)" value={adminPassword} onChange={(e) => setPwd(e.target.value)} placeholder="Admin@123" />
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

  const load = () => getTenants().then(setTenants).catch((e) => { toast.error(e.message || 'Failed to load'); setTenants([]); });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const toggle = async (t) => {
    const next = t.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try { await setTenantStatus(t.slug, next); toast.success(`${t.name} ${next.toLowerCase()}`); load(); }
    catch (e) { toast.error(e.message || 'Failed'); }
  };

  const copy = (slug) => { navigator.clipboard?.writeText(slug); setCopied(slug); setTimeout(() => setCopied(''), 1500); };

  if (tenants === null) return <Spinner full />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
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
                        <Button variant="outline" className="h-8" onClick={() => toggle(t)}>
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
    </div>
  );
}
