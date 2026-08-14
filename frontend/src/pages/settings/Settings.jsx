import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Save, Building2, MapPin, Phone, Receipt } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Input from '../../components/ui/Input.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getSettings, updateSettings } from '../../services/settingService.js';

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

export default function Settings() {
  const { role } = useAuth();
  const toast = useToast();
  const canEdit = EDIT_ROLES.includes(role);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><SettingsIcon className="h-5 w-5" /> Settings</h1>
          <p className="mt-0.5 text-sm text-muted">
            Hospital profile used across the app and on printed documents (invoices, prescriptions).
          </p>
        </div>
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
