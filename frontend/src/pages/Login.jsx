import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { Activity, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import Input from '../components/ui/Input.jsx';
import Button from '../components/ui/Button.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { setTenant, getTenant } from '../services/api.js';

export default function Login() {
  const { login, isAuthenticated, loading, role } = useAuth();
  const homeFor = (r) => (r === 'PATIENT' ? '/portal' : '/');
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState('');

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-fg">
            <Activity className="h-6 w-6" />
          </span>
          <h1 className="text-xl font-semibold">Hospital Management System</h1>
          <p className="mt-1 text-sm text-muted">Sign in to your account</p>
        </div>

        <div className="card p-6">
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
              placeholder="admin@hms.local"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email', {
                required: 'Email is required',
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' },
              })}
            />
            <Input
              id="password"
              type="password"
              label="Password"
              placeholder="••••••••"
              autoComplete="current-password"
              error={errors.password?.message}
              {...register('password', { required: 'Password is required' })}
            />
            <Input
              id="hospital"
              label="Hospital code"
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
        <p className="mt-2 text-center text-xs text-muted">
          Default admin: <span className="font-medium text-fg">admin@hms.local</span> / Admin@123
        </p>
      </div>
    </div>
  );
}
