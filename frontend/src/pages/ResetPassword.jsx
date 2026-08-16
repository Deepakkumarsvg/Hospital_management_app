import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Activity, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import Input from '../components/ui/Input.jsx';
import Button from '../components/ui/Button.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import PasswordStrength, { isPasswordValid } from '../components/PasswordStrength.jsx';
import { resetPassword } from '../services/authService.js';
import { setTenant } from '../services/api.js';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const hospital = params.get('hospital');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState('');

  const mismatch = confirm && password !== confirm;
  const canSubmit = isPasswordValid(password) && !mismatch && confirm;

  const onSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    setSaving(true);
    try {
      // The link carries the hospital it was issued for — pin it so the
      // request lands on the right tenant's database.
      if (hospital) setTenant(hospital.trim().toLowerCase());
      await resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err) {
      setServerError(err.message || 'Could not reset the password');
    } finally { setSaving(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-fg">
            <Activity className="h-6 w-6" />
          </span>
          <h1 className="text-xl font-semibold">Set a new password</h1>
          <p className="mt-1 text-sm text-muted">Choose something you haven't used before.</p>
        </div>

        <div className="card p-6">
          {!token ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>This reset link is missing its token. Request a new one.</span>
            </div>
          ) : done ? (
            <div className="space-y-3 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-green-600 dark:text-green-400" />
              <p className="text-sm">Password updated. Taking you to sign in…</p>
            </div>
          ) : (
            <>
              {serverError && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{serverError}</span>
                </div>
              )}
              <form onSubmit={onSubmit} className="space-y-4" noValidate>
                <div>
                  <Input
                    id="password" type="password" label="New password" autoComplete="new-password"
                    value={password} onChange={(e) => setPassword(e.target.value)} required
                  />
                  <PasswordStrength value={password} />
                </div>
                <Input
                  id="confirm" type="password" label="Confirm password" autoComplete="new-password"
                  value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  error={mismatch ? 'Passwords do not match' : undefined} required
                />
                <Button type="submit" loading={saving} disabled={!canSubmit} className="w-full">Reset password</Button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-sm">
          <Link to="/login" className="inline-flex items-center gap-1 text-muted hover:text-fg">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
