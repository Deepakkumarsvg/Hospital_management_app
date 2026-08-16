import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { Activity, AlertCircle, Mail, Lock, Building2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import Input from '../components/ui/Input.jsx';
import Button from '../components/ui/Button.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import AuthBackdrop from '../components/AuthBackdrop.jsx';
import { setTenant, getTenant } from '../services/api.js';
import { getPublicSettings, logoUrl } from '../services/settingService.js';

// Frosted surface shared by the card and the fields inside it. Falls back to
// a near-opaque panel where backdrop-filter isn't supported, so the form is
// never unreadable against the decorated background.
const GLASS = 'border border-fg/10 bg-elevated/80 backdrop-blur-xl supports-[backdrop-filter]:bg-elevated/55';

export default function Login() {
  const { login, isAuthenticated, loading, role } = useAuth();
  const homeFor = (r) => (r === 'PATIENT' ? '/portal' : '/');
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [brand, setBrand] = useState(null);
  const [brandTenant, setBrandTenant] = useState(getTenant());

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { email: '', password: '', hospital: getTenant() } });

  const hospital = watch('hospital');

  // Branding follows the hospital code as it's typed, so you can see which
  // hospital you're signing in to before submitting. Best-effort — an unknown
  // slug just falls back to the generic name/mark instead of erroring.
  useEffect(() => {
    const slug = (hospital || 'default').trim().toLowerCase();
    let alive = true;
    const t = setTimeout(() => {
      getPublicSettings(slug)
        .then((s) => alive && setBrand(s))
        .catch(() => alive && setBrand(null))
        .finally(() => alive && setBrandTenant(slug));
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [hospital]);

  // A stale "wrong password" banner shouldn't outlive the correction.
  useEffect(() => {
    const sub = watch(() => setServerError((e) => (e ? '' : e)));
    return () => sub.unsubscribe();
  }, [watch]);

  // Already logged in → bounce to the right home for the role.
  if (!loading && isAuthenticated) {
    return <Navigate to={location.state?.from?.pathname || homeFor(role)} replace />;
  }

  const onSubmit = async ({ email, password, hospital: slug }) => {
    setServerError('');
    try {
      // Pin the chosen hospital before authenticating so the request is scoped.
      setTenant((slug || 'default').trim().toLowerCase());
      const u = await login(email, password);
      navigate(location.state?.from?.pathname || homeFor(u.role), { replace: true });
    } catch (err) {
      setServerError(err.message || 'Login failed');
    }
  };

  const logo = logoUrl(brand, brandTenant);
  const hospitalField = register('hospital');
  const fieldClass = 'border-fg/10 bg-elevated/60 backdrop-blur-sm';

  return (
    // Sized to the viewport, and deliberately compact so the whole form fits
    // without scrolling even on a short window or at 125% browser zoom.
    <div className="relative flex min-h-[100dvh] items-center justify-center px-4 py-6">
      <AuthBackdrop />

      <div className={`fixed right-4 top-4 z-10 rounded-xl ${GLASS}`}>
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-sm animate-fadeIn">
        <div className="mb-4 flex items-center justify-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-accent text-accent-fg shadow-lg shadow-fg/10 ring-1 ring-fg/10">
            {logo ? <img src={logo} alt="" className="h-full w-full object-contain p-1.5" /> : <Activity className="h-6 w-6" />}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold leading-tight tracking-tight">
              {brand?.hospitalName || 'Hospital Management System'}
            </h1>
            <p className="truncate text-xs text-muted">{brand?.tagline || 'Sign in to your account'}</p>
          </div>
        </div>

        <div className={`rounded-xl p-5 shadow-2xl shadow-fg/10 ${GLASS}`}>
          {serverError && (
            <div role="alert" className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500 backdrop-blur-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
            <Input
              id="email"
              type="email"
              label="Email"
              icon={Mail}
              placeholder="admin@hms.local"
              autoComplete="email"
              autoFocus
              className={fieldClass}
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
                className={fieldClass}
                error={errors.password?.message}
                suffix={
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted transition-colors hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
                {...register('password', { required: 'Password is required' })}
              />
              <div className="mt-1 text-right">
                <Link to="/forgot-password" className="text-xs text-muted hover:text-fg hover:underline">Forgot password?</Link>
              </div>
            </div>
            <Input
              id="hospital"
              label="Hospital code"
              icon={Building2}
              placeholder="default"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className={fieldClass}
              {...hospitalField}
              // Slugs are always lowercase and unspaced — normalise as typed
              // so the field shows exactly what gets sent.
              onChange={(e) => {
                e.target.value = e.target.value.toLowerCase().replace(/\s+/g, '');
                hospitalField.onChange(e);
              }}
            />
            <Button type="submit" loading={isSubmitting} className="w-full">
              {isSubmitting ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>
        </div>

        <p className="mt-3 text-center text-xs text-muted">
          Are you a patient?{' '}
          <Link to="/portal/register" className="font-medium text-fg hover:underline">Create an account</Link>
        </p>

        {/* Seeded demo credentials — only ever shown on a dev build, never
            printed on a deployed login screen. */}
        {import.meta.env.DEV && (
          <div className={`mt-3 rounded-lg px-3 py-1.5 text-center text-[11px] text-muted ${GLASS}`}>
            Dev: <span className="font-mono font-medium text-fg">admin@hms.local</span> / <span className="font-mono font-medium text-fg">Admin@123</span>
          </div>
        )}
      </div>
    </div>
  );
}
