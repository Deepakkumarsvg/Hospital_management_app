import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import Modal from '../../components/ui/Modal.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Button from '../../components/ui/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { createDoctor, updateDoctor } from '../../services/doctorService.js';
import { activeDepartments } from '../../services/departmentService.js';
import { listUsers } from '../../services/userService.js';
import { WEEKDAYS, PATIENT_STATUS_OPTIONS } from '../../utils/constants.js';

const EMPTY = {
  firstName: '', lastName: '', registrationNo: '', specialization: '',
  department: '', qualification: '', experienceYears: 0, phone: '', email: '',
  consultationFee: 0, status: 'ACTIVE', user: '',
};

export default function DoctorForm({ open, onClose, doctor, onSaved }) {
  const toast = useToast();
  const isEdit = !!doctor;
  const [departments, setDepartments] = useState([]);
  const [doctorUsers, setDoctorUsers] = useState([]); // DOCTOR-role login accounts
  const [days, setDays] = useState([]); // selected weekday availability

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: EMPTY });

  useEffect(() => {
    if (!open) return;
    activeDepartments().then(setDepartments).catch(() => {});
    // Admin-only form, so listing users is permitted.
    listUsers({ role: 'DOCTOR', limit: 100 }).then((r) => setDoctorUsers(r.items)).catch(() => setDoctorUsers([]));
    if (doctor) {
      reset({
        ...EMPTY, ...doctor,
        department: doctor.department?.id || doctor.department?._id || doctor.department || '',
        user: doctor.user?.id || doctor.user?._id || doctor.user || '',
      });
      setDays((doctor.availability || []).map((a) => a.day));
    } else {
      reset(EMPTY);
      setDays([]);
    }
  }, [open, doctor, reset]);

  const toggleDay = (d) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const onSubmit = async (values) => {
    const payload = {
      ...values,
      experienceYears: Number(values.experienceYears) || 0,
      consultationFee: Number(values.consultationFee) || 0,
      availability: days.map((d) => ({ day: d, from: '09:00', to: '17:00' })),
      user: values.user || null, // link to a login account (optional)
    };
    try {
      isEdit
        ? await updateDoctor(doctor.id || doctor._id, payload)
        : await createDoctor(payload);
      toast.success(isEdit ? 'Doctor updated' : 'Doctor added');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Could not save doctor');
    }
  };

  const deptOptions = departments.map((d) => ({ value: d.id || d._id, label: `${d.name} (${d.code})` }));
  const userOptions = doctorUsers.map((u) => ({ value: u.id || u._id, label: `${u.name} · ${u.email}` }));

  return (
    <Modal
      open={open} onClose={onClose} size="2xl"
      title={isEdit ? `Edit ${doctor.fullName}` : 'Add Doctor'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" form="doctor-form" loading={isSubmitting}>{isEdit ? 'Save Changes' : 'Add Doctor'}</Button>
        </>
      }
    >
      <form id="doctor-form" onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Input id="firstName" label="First Name *" error={errors.firstName?.message}
          {...register('firstName', { required: 'First name is required' })} />
        <Input id="lastName" label="Last Name" {...register('lastName')} />
        <Input id="registrationNo" label="Registration No *" error={errors.registrationNo?.message}
          {...register('registrationNo', { required: 'Registration number is required' })} />
        <Input id="specialization" label="Specialization *" placeholder="Cardiologist"
          error={errors.specialization?.message}
          {...register('specialization', { required: 'Specialization is required' })} />
        <Select id="department" label="Department *" placeholder="Select department" options={deptOptions}
          error={errors.department?.message}
          {...register('department', { required: 'Department is required' })} />
        <Input id="qualification" label="Qualification" placeholder="MD, DM" {...register('qualification')} />
        <Input id="experienceYears" type="number" min="0" label="Experience (years)" {...register('experienceYears')} />
        <Input id="consultationFee" type="number" min="0" label="Consultation Fee (₹)" {...register('consultationFee')} />
        <Input id="phone" label="Phone *" error={errors.phone?.message}
          {...register('phone', { required: 'Phone is required', pattern: { value: /^[0-9+\-\s()]{7,15}$/, message: 'Invalid phone' } })} />
        <Input id="email" type="email" label="Email"
          error={errors.email?.message}
          {...register('email', { pattern: { value: /^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email' } })} />

        {isEdit && (
          <Select id="status" label="Status" options={PATIENT_STATUS_OPTIONS} {...register('status')} />
        )}
        <Select id="user" label="Linked Login (optional)" placeholder="No login account"
          options={userOptions} {...register('user')} />

        <div className="sm:col-span-2">
          <label className="label">Available Days</label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => (
              <button
                key={d} type="button" onClick={() => toggleDay(d)}
                className={
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ' +
                  (days.includes(d)
                    ? 'border-transparent bg-accent text-accent-fg'
                    : 'border-border text-muted hover:bg-surface')
                }
              >
                {d}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">Default hours 09:00–17:00 on selected days.</p>
        </div>
      </form>
    </Modal>
  );
}
