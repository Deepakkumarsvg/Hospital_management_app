import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Activity, AlertCircle, MailCheck, ArrowLeft } from 'lucide-react';
import Input from '../components/ui/Input.jsx';
import Button from '../components/ui/Button.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { forgotPassword } from '../services/authService.js';
import { setTenant, getTenant } from '../services/api.js';

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm({ defaultValues: { email: '', hospital: getTenant() } });

  const onSubmit = async ({ email, hospital }) => {
    setServerError('');
    try {
      // Scope the request to the right hospital before sending, same as login.
      setTenant((hospital || 'default').trim().toLowerCase());
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setServerError(err.message || 'Could not send the reset link');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-fg">
            <Activity className="h-6 w-6" />
          </span>
          <h1 className="text-xl font-semibold">Forgot your password?</h1>
          <p className="mt-1 text-sm text-muted">We'll email you a link to set a new one.</p>
        </div>

        <div className="card p-6">
          {sent ? (
            <div className="space-y-3 text-center">
              <MailCheck className="mx-auto h-8 w-8 text-green-600 dark:text-green-400" />
              <p className="text-sm">If that email has an account, a reset link is on its way.</p>
              <p className="text-xs text-muted">The link expires in 30 minutes and can only be used once.</p>
            </div>
          ) : (
            <>
              {serverError && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{serverError}</span>
                </div>
              )}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <Input
                  id="email" type="email" label="Email" placeholder="you@hospital.com" autoComplete="email"
                  error={errors.email?.message}
                  {...register('email', {
                    required: 'Email is required',
                    pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' },
                  })}
                />
                <Input id="hospital" label="Hospital code" placeholder="default" autoCapitalize="off" spellCheck={false} {...register('hospital')} />
                <Button type="submit" loading={isSubmitting} className="w-full">Send reset link</Button>
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
