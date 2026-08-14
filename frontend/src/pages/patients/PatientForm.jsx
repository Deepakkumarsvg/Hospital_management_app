import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import Modal from '../../components/ui/Modal.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Button from '../../components/ui/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { createPatient, updatePatient } from '../../services/patientService.js';
import {
  GENDER_OPTIONS, BLOOD_GROUP_OPTIONS, PATIENT_STATUS_OPTIONS, toDateInput,
} from '../../utils/constants.js';

const EMPTY = {
  firstName: '', lastName: '', gender: '', dateOfBirth: '', phone: '', email: '',
  bloodGroup: 'UNKNOWN',
  address: { line: '', city: '', state: '', pincode: '' },
  emergencyContact: { name: '', relation: '', phone: '' },
  allergies: '', medicalHistory: '',
  insurance: { provider: '', policyNumber: '', validTill: '' },
  status: 'ACTIVE',
};

function SectionTitle({ children }) {
  return (
    <h3 className="col-span-full mt-2 text-xs font-semibold uppercase tracking-wide text-muted">
      {children}
    </h3>
  );
}

export default function PatientForm({ open, onClose, patient, onSaved }) {
  const toast = useToast();
  const isEdit = !!patient;

  const {
    register, handleSubmit, reset,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: EMPTY });

  // Populate when opening for edit; reset to blank for create.
  useEffect(() => {
    if (!open) return;
    if (patient) {
      reset({
        ...EMPTY,
        ...patient,
        dateOfBirth: toDateInput(patient.dateOfBirth),
        address: { ...EMPTY.address, ...(patient.address || {}) },
        emergencyContact: { ...EMPTY.emergencyContact, ...(patient.emergencyContact || {}) },
        insurance: {
          ...EMPTY.insurance,
          ...(patient.insurance || {}),
          validTill: toDateInput(patient.insurance?.validTill),
        },
      });
    } else {
      reset(EMPTY);
    }
  }, [open, patient, reset]);

  const onSubmit = async (values) => {
    // Drop empty insurance.validTill so the backend doesn't get an invalid date.
    const payload = { ...values };
    if (!payload.insurance?.validTill) delete payload.insurance.validTill;

    try {
      const saved = isEdit
        ? await updatePatient(patient.id || patient._id, payload)
        : await createPatient(payload);
      toast.success(isEdit ? 'Patient updated' : `Patient registered · ${saved.uhid}`);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Could not save patient');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      title={isEdit ? `Edit Patient · ${patient.uhid}` : 'Register New Patient'}
      description={isEdit ? undefined : 'A unique UHID will be generated automatically.'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="patient-form" loading={isSubmitting}>
            {isEdit ? 'Save Changes' : 'Register Patient'}
          </Button>
        </>
      }
    >
      <form id="patient-form" onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <SectionTitle>Personal Details</SectionTitle>
        <Input
          id="firstName" label="First Name *" placeholder="Deepak"
          error={errors.firstName?.message}
          {...register('firstName', { required: 'First name is required' })}
        />
        <Input id="lastName" label="Last Name" placeholder="Sharma" {...register('lastName')} />
        <Select
          id="gender" label="Gender *" placeholder="Select gender" options={GENDER_OPTIONS}
          error={errors.gender?.message}
          {...register('gender', { required: 'Gender is required' })}
        />
        <Input
          id="dateOfBirth" type="date" label="Date of Birth *"
          error={errors.dateOfBirth?.message}
          {...register('dateOfBirth', { required: 'Date of birth is required' })}
        />
        <Select id="bloodGroup" label="Blood Group" options={BLOOD_GROUP_OPTIONS} {...register('bloodGroup')} />
        {isEdit && (
          <Select id="status" label="Status" options={PATIENT_STATUS_OPTIONS} {...register('status')} />
        )}

        <SectionTitle>Contact</SectionTitle>
        <Input
          id="phone" label="Phone *" placeholder="9876543210"
          error={errors.phone?.message}
          {...register('phone', {
            required: 'Phone is required',
            pattern: { value: /^[0-9+\-\s()]{7,15}$/, message: 'Enter a valid phone' },
          })}
        />
        <Input
          id="email" type="email" label="Email" placeholder="patient@example.com"
          error={errors.email?.message}
          {...register('email', {
            pattern: { value: /^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' },
          })}
        />
        <Input id="line" label="Address" placeholder="Street / House" className="sm:col-span-2" {...register('address.line')} />
        <Input id="city" label="City" {...register('address.city')} />
        <Input id="state" label="State" {...register('address.state')} />
        <Input id="pincode" label="Pincode" {...register('address.pincode')} />

        <SectionTitle>Emergency Contact</SectionTitle>
        <Input id="ecName" label="Name" {...register('emergencyContact.name')} />
        <Input id="ecRelation" label="Relation" placeholder="Brother" {...register('emergencyContact.relation')} />
        <Input id="ecPhone" label="Phone" {...register('emergencyContact.phone')} />

        <SectionTitle>Medical</SectionTitle>
        <Input id="allergies" label="Allergies" placeholder="Penicillin, Dust" className="sm:col-span-2" {...register('allergies')} />
        <div className="sm:col-span-2">
          <label htmlFor="medicalHistory" className="label">Medical History</label>
          <textarea
            id="medicalHistory" rows={3} className="input resize-y"
            placeholder="Chronic conditions, past surgeries, ongoing medication…"
            {...register('medicalHistory')}
          />
        </div>

        <SectionTitle>Insurance (optional)</SectionTitle>
        <Input id="insProvider" label="Provider" placeholder="Star Health" {...register('insurance.provider')} />
        <Input id="insPolicy" label="Policy Number" {...register('insurance.policyNumber')} />
        <Input id="insValid" type="date" label="Valid Till" {...register('insurance.validTill')} />
      </form>
    </Modal>
  );
}
