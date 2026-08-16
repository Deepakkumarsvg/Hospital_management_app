import { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getPortalProfile } from '../../services/portalService.js';
import { formatDate } from '../../utils/constants.js';

function Field({ label, value }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value || '—'}</p>
    </div>
  );
}

export default function PortalProfile() {
  const toast = useToast();
  const [p, setP] = useState(null);

  useEffect(() => {
    getPortalProfile().then(setP).catch((e) => toast.error(e.message || 'Failed to load'));
  }, [toast]);

  if (!p) return <Spinner full />;

  const addr = [p.address?.line, p.address?.city, p.address?.state, p.address?.pincode].filter(Boolean).join(', ');

  return (
    <div className="space-y-5">
      <div className="card flex items-center gap-3 p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface"><User className="h-6 w-6" /></span>
        <div>
          <h1 className="text-xl font-semibold">{p.firstName} {p.lastName}</h1>
          <p className="text-sm text-muted">UHID <span className="font-mono">{p.uhid}</span></p>
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Gender" value={p.gender} />
          <Field label="Date of birth" value={formatDate(p.dateOfBirth)} />
          <Field label="Age" value={p.age != null ? `${p.age} years` : '—'} />
          <Field label="Blood group" value={p.bloodGroup} />
          <Field label="Phone" value={p.phone} />
          <Field label="Email" value={p.email} />
          <Field label="Address" value={addr} />
          <Field label="Allergies" value={p.allergies} />
        </div>
        <p className="mt-4 text-xs text-muted">To update your details, please contact the hospital reception.</p>
      </Card>
    </div>
  );
}
