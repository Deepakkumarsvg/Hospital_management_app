import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate } from 'react-router-dom';
import { HeartPulse, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Button from '../../components/ui/Button.jsx';
import ThemeToggle from '../../components/ThemeToggle.jsx';
import { registerPatient } from '../../services/portalService.js';

const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
];

export default function PortalRegister() {
  const { isAuthenticated, loading } = useAuth();
  const [serverError, setServerError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { firstName: '', lastName: '', gender: 'MALE', dateOfBirth: '', phone: '', email: '', password: '' },
  });

  if (!loading && isAuthenticated) return <Navigate to="/portal" replace />;

  const onSubmit = async (values) => {
    setServerError('');
    try {
      await registerPatient(values);
      // Token is stored by the service. A full navigation re-mounts AuthProvider,
      // which restores the session (role PATIENT) and lands on the portal.
      window.location.assign('/portal');
    } catch (err) {
      setServerError(err.message || 'Registration failed');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-8">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-fg">
            <HeartPulse className="h-6 w-6" />
          </span>
          <h1 className="text-xl font-semibold">Create your patient account</h1>
          <p className="mt-1 text-sm text-muted">Book appointments and access your records online.</p>
        </div>

        <div className="card p-6">
          {serverError && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{serverError}</span>
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-4" noValidate>
            <Input label="First name" error={errors.firstName?.message} {...register('firstName', { required: 'Required' })} />
            <Input label="Last name" {...register('lastName')} />
            <Select label="Gender" options={GENDER_OPTIONS} {...register('gender')} />
            <Input type="date" label="Date of birth" error={errors.dateOfBirth?.message} {...register('dateOfBirth', { required: 'Required' })} />
            <Input className="col-span-2" label="Phone" error={errors.phone?.message} {...register('phone', { required: 'Required' })} />
            <Input className="col-span-2" type="email" label="Email" error={errors.email?.message}
              {...register('email', { required: 'Required', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' } })} />
            <Input className="col-span-2" type="password" label="Password" error={errors.password?.message}
              {...register('password', { required: 'Required', minLength: { value: 6, message: 'At least 6 characters' } })} />
            <Button type="submit" loading={isSubmitting} className="col-span-2 w-full">Create account</Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account? <Link to="/login" className="font-medium text-fg underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
