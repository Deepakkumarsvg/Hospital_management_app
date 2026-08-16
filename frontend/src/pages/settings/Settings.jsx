import { useEffect, useRef, useState } from 'react';
import {
  Settings as SettingsIcon, Save, Building2, MapPin, Phone, Receipt, Image as ImageIcon,
  Upload, Trash2, Plug, Mail, MessageSquare, CreditCard, RefreshCw, UserCircle, KeyRound, CheckCircle2,
} from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Input from '../../components/ui/Input.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getSettings, updateSettings, logoUrl, uploadLogo, removeLogo } from '../../services/settingService.js';
import { getOpsStatus, runReminders } from '../../services/opsService.js';
import { changePassword } from '../../services/authService.js';
import PasswordStrength, { isPasswordValid } from '../../components/PasswordStrength.jsx';

const EDIT_ROLES = ['SUPER_ADMIN', 'ADMIN'];

function Section({ title, icon: Icon, children }) {
  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// General / Address / Contact / Billing — the hospital-wide profile form.
// ---------------------------------------------------------------------------
function ProfileForm({ canEdit }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings()
      .then(setForm)
      .catch((e) => toast.error(e.message || 'Failed to load settings'))
      .finally(() => setLoading(false));
  }, [toast]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateSettings(form);
      setForm(updated);
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner full />;
  if (!form) return null;

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="flex items-center justify-end">
        {canEdit && <Button type="submit" loading={saving}><Save className="h-4 w-4" /> Save changes</Button>}
      </div>

      {!canEdit && (
        <p className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-muted">
          You have read-only access. Only administrators can change these settings.
        </p>
      )}

      <fieldset disabled={!canEdit || saving} className="space-y-5">
        <Section title="Identity" icon={Building2}>
          <Input label="Hospital name" value={form.hospitalName || ''} onChange={set('hospitalName')} />
          <Input label="Tagline" value={form.tagline || ''} onChange={set('tagline')} />
          <Input label="Registration No." value={form.registrationNo || ''} onChange={set('registrationNo')} />
          <Input label="Website" value={form.website || ''} onChange={set('website')} />
        </Section>

        <Section title="Address" icon={MapPin}>
          <Input className="sm:col-span-2" label="Address line" value={form.addressLine || ''} onChange={set('addressLine')} />
          <Input label="City" value={form.city || ''} onChange={set('city')} />
          <Input label="State" value={form.state || ''} onChange={set('state')} />
          <Input label="Pincode" value={form.pincode || ''} onChange={set('pincode')} />
        </Section>

        <Section title="Contact" icon={Phone}>
          <Input label="Phone" value={form.phone || ''} onChange={set('phone')} />
          <Input type="email" label="Email" value={form.email || ''} onChange={set('email')} />
        </Section>

        <Section title="Billing & Documents" icon={Receipt}>
          <Input label="Currency symbol" value={form.currency || ''} onChange={set('currency')} />
          <Input type="number" step="0.01" label="Default tax %" value={form.defaultTaxPercent ?? 0} onChange={set('defaultTaxPercent')} />
          <Input label="GSTIN" value={form.gstin || ''} onChange={set('gstin')} />
          <Input label="Invoice footer note" value={form.invoiceFooter || ''} onChange={set('invoiceFooter')} />
        </Section>
      </fieldset>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Branding — logo shown on invoices, prescriptions and other printed
// documents, plus (once wired) in the app's own header.
// ---------------------------------------------------------------------------
function BrandingPanel({ canEdit }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const load = () => getSettings().then(setSettings).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try { await uploadLogo(file); toast.success('Logo updated'); load(); }
    catch (err) { toast.error(err.message || 'Upload failed'); }
    finally { setUploading(false); }
  };

  const onRemove = async () => {
    setRemoving(true);
    try { await removeLogo(); toast.success('Logo removed'); load(); }
    catch (err) { toast.error(err.message || 'Failed'); }
    finally { setRemoving(false); }
  };

  if (loading) return <Spinner full />;
  const url = logoUrl(settings);

  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-muted" />
        <h2 className="text-sm font-semibold">Hospital Logo</h2>
      </div>
      <p className="mb-4 text-xs text-muted">Appears on invoices, prescriptions and other printed documents. JPG or PNG, max 5 MB.</p>
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface">
          {url ? <img src={url} alt="Hospital logo" className="h-full w-full object-contain p-2" /> : <ImageIcon className="h-8 w-8 text-muted/40" />}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={onPick} />
            <Button variant="outline" onClick={() => fileRef.current?.click()} loading={uploading}><Upload className="h-4 w-4" /> {url ? 'Replace' : 'Upload'}</Button>
            {url && <Button variant="outline" onClick={onRemove} loading={removing} className="!text-red-500"><Trash2 className="h-4 w-4" /> Remove</Button>}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Integrations — live status of outbound channels + a manual trigger for
// the reminder job. Admin-only (matches backend RBAC on /ops).
// ---------------------------------------------------------------------------
function IntegrationsPanel() {
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState(null);

  useEffect(() => { getOpsStatus().then(setStatus).catch((e) => toast.error(e.message)).finally(() => setLoading(false)); }, [toast]);

  const onRun = async () => {
    setRunning(true);
    try { const r = await runReminders(); setLastRun(r); toast.success(`Sent ${r.sent} of ${r.scanned} reminder(s)`); }
    catch (err) { toast.error(err.message || 'Failed'); }
    finally { setRunning(false); }
  };

  if (loading) return <Spinner full />;
  if (!status) return null;

  const rows = [
    { key: 'email', label: 'Email delivery', icon: Mail, live: status.channels.email !== 'dev-log', value: status.channels.email },
    { key: 'sms', label: 'SMS delivery', icon: MessageSquare, live: status.channels.sms !== 'dev-log', value: status.channels.sms },
    { key: 'payments', label: 'Payment gateway', icon: CreditCard, live: status.payments.mode !== 'mock', value: status.payments.mode },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Plug className="h-4 w-4 text-muted" />
          <h2 className="text-sm font-semibold">Integration Status</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between rounded-lg border border-border px-3 py-3">
              <span className="flex items-center gap-2 text-sm font-medium"><r.icon className="h-4 w-4 text-muted" /> {r.label}</span>
              <Badge tone={r.live ? 'success' : 'warning'}>{r.live ? r.value : 'Dev mode'}</Badge>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          "Dev mode" means messages are logged on the server instead of actually sent — set SMTP_HOST / SMS_PROVIDER / RAZORPAY_KEY_ID in the backend environment to go live.
        </p>
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-muted" />
          <h2 className="text-sm font-semibold">Appointment Reminders</h2>
        </div>
        <p className="mb-3 text-sm text-muted">Runs automatically every hour for tomorrow's bookings. Trigger it early if you need to send reminders right now.</p>
        <Button variant="outline" onClick={onRun} loading={running}><RefreshCw className="h-4 w-4" /> Run now</Button>
        {lastRun && <p className="mt-2 text-xs text-muted">Last run: sent {lastRun.sent} of {lastRun.scanned} scanned, across {lastRun.tenants} hospital(s).</p>}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// My Account — available to every signed-in user, not just admins.
// ---------------------------------------------------------------------------
function MyAccountPanel() {
  const { user } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!isPasswordValid(form.newPassword)) return toast.error('New password does not meet the requirements');
    if (form.newPassword !== form.confirmPassword) return toast.error('New passwords do not match');
    setSaving(true);
    try {
      await changePassword(form.currentPassword, form.newPassword);
      // The backend retires every token issued before the change, so this
      // session's token is now stale — say so rather than letting the next
      // request fail with an unexplained sign-out.
      toast.success('Password changed — sign in again to continue');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast.error(err.message || 'Could not change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <UserCircle className="h-4 w-4 text-muted" />
          <h2 className="text-sm font-semibold">Profile</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div><p className="text-xs text-muted">Name</p><p className="mt-0.5 text-sm font-medium">{user?.name}</p></div>
          <div><p className="text-xs text-muted">Email</p><p className="mt-0.5 text-sm font-medium">{user?.email}</p></div>
          <div><p className="text-xs text-muted">Role</p><p className="mt-0.5 text-sm font-medium">{user?.role?.replace(/_/g, ' ')}</p></div>
        </div>
        <p className="mt-3 text-xs text-muted">To change your name, email or role, ask an administrator.</p>
      </Card>

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted" />
          <h2 className="text-sm font-semibold">Change Password</h2>
        </div>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input type="password" label="Current password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required />
          <div>
            <Input type="password" label="New password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required />
            <PasswordStrength value={form.newPassword} />
          </div>
          <Input type="password" label="Confirm new password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            error={form.confirmPassword && form.newPassword !== form.confirmPassword ? 'Passwords do not match' : undefined} required />
          <div className="sm:col-span-3">
            <Button type="submit" loading={saving}><CheckCircle2 className="h-4 w-4" /> Update password</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
export default function Settings() {
  const { role } = useAuth();
  const canEdit = EDIT_ROLES.includes(role);
  const tabs = canEdit
    ? ['General', 'Branding', 'Integrations', 'My Account']
    : ['General', 'My Account'];
  const [tab, setTab] = useState('General');

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><SettingsIcon className="h-5 w-5" /> Settings</h1>
        <p className="mt-0.5 text-sm text-muted">Hospital configuration, branding, integrations and your account.</p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={'rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ' +
              (tab === t ? 'border-b-2 border-fg text-fg' : 'text-muted hover:text-fg')}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'General' && <ProfileForm canEdit={canEdit} />}
      {tab === 'Branding' && canEdit && <BrandingPanel canEdit={canEdit} />}
      {tab === 'Integrations' && canEdit && <IntegrationsPanel />}
      {tab === 'My Account' && <MyAccountPanel />}
    </div>
  );
}
