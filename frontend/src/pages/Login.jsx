import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { Activity, AlertCircle, Mail, Lock, Building2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import Input from '../components/ui/Input.jsx';
import Button from '../components/ui/Button.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { setTenant, getTenant } from '../services/api.js';
import { getPublicSettings, logoUrl } from '../services/settingService.js';

export default function Login() {
  const { login, isAuthenticated, loading, role } = useAuth();
  const homeFor = (r) => (r === 'PATIENT' ? '/portal' : '/');
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [brand, setBrand] = useState(null);

  // Best-effort branding — the login screen still works fine if this fails
  // (e.g. an unreachable tenant slug), just with the generic name/mark.
  useEffect(() => { getPublicSettings().then(setBrand).catch(() => {}); }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { email: '', password: '', hospital: getTenant() } });

  // Already logged in → bounce to the right home for the role.
  if (!loading && isAuthenticated) {
    return <Navigate to={location.state?.from?.pathname || homeFor(role)} replace />;
  }

  const onSubmit = async ({ email, password, hospital }) => {
    setServerError('');
    try {
      // Pin the chosen hospital before authenticating so the request is scoped.
      setTenant((hospital || 'default').trim().toLowerCase());
      const u = await login(email, password);
      navigate(location.state?.from?.pathname || homeFor(u.role), { replace: true });
    } catch (err) {
      setServerError(err.message || 'Login failed');
    }
  };

  const logo = logoUrl(brand);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4 py-10">
      {/* Soft decorative glow — stays inside the app's own monochrome palette. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-fg/[0.05] blur-3xl dark:bg-fg/[0.07]" />
      </div>

      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm animate-fadeIn">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-accent text-accent-fg shadow-lg shadow-fg/10">
            {logo ? <img src={logo} alt="" className="h-full w-full object-contain p-2" /> : <Activity className="h-7 w-7" />}
          </span>
          <h1 className="text-xl font-semibold tracking-tight">{brand?.hospitalName || 'Hospital Management System'}</h1>
          <p className="mt-1 text-sm text-muted">{brand?.tagline || 'Sign in to your account'}</p>
        </div>

        <div className="card p-6 shadow-xl shadow-fg/[0.04]">
          {serverError && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <Input
              id="email"
              type="email"
              label="Email"
              icon={Mail}
              placeholder="admin@hms.local"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email', {
                required: 'Email is required',
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' },
              })}
            />
            <div>
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                label="Password"
                icon={Lock}
                placeholder="••••••••"
                autoComplete="current-password"
                error={errors.password?.message}
                suffix={
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-fg"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
                {...register('password', { required: 'Password is required' })}
              />
              <div className="mt-1.5 text-right">
                <Link to="/forgot-password" className="text-xs text-muted hover:text-fg hover:underline">Forgot password?</Link>
              </div>
            </div>
            <Input
              id="hospital"
              label="Hospital code"
              icon={Building2}
              placeholder="default"
              autoCapitalize="off"
              spellCheck={false}
              {...register('hospital')}
            />
            <Button type="submit" loading={isSubmitting} className="w-full">
              Sign In
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          Are you a patient? <Link to="/portal/register" className="font-medium text-fg underline">Create an account</Link>
        </p>
        {/* Seeded demo credentials — only ever shown on a dev build, never
            printed on a deployed login screen. */}
        {import.meta.env.DEV && (
          <div className="mt-4 rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-center text-xs text-muted">
            Dev login: <span className="font-mono font-medium text-fg">admin@hms.local</span> / <span className="font-mono font-medium text-fg">Admin@123</span>
          </div>
        )}
      </div>
    </div>
  );
}
