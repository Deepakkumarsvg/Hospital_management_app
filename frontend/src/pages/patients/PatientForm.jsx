import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { Plus, X } from 'lucide-react';
import Modal from '../../components/ui/Modal.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Button from '../../components/ui/Button.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
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
  insurances: [],
  status: 'ACTIVE',
};

const BLANK_POLICY = { provider: '', policyNumber: '', validTill: '' };

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

  const [duplicate, setDuplicate] = useState(null); // { existing, values } while awaiting user confirmation
  const [confirming, setConfirming] = useState(false);

  const {
    register, handleSubmit, reset, control,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: EMPTY });

  const { fields: policyFields, append: addPolicy, remove: removePolicy } = useFieldArray({ control, name: 'insurances' });

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
        insurances: (patient.insurances || []).map((p) => ({ ...BLANK_POLICY, ...p, validTill: toDateInput(p.validTill) })),
      });
    } else {
      reset(EMPTY);
    }
    setDuplicate(null);
  }, [open, patient, reset]);

  const save = async (payload) => {
    const saved = isEdit
      ? await updatePatient(patient.id || patient._id, payload)
      : await createPatient(payload);
    toast.success(isEdit ? 'Patient updated' : `Patient registered · ${saved.uhid}`);
    onSaved?.(saved);
    onClose();
  };

  const onSubmit = async (values) => {
    const payload = {
      ...values,
      // Drop blank rows and empty validTill dates so the backend doesn't choke on invalid dates.
      insurances: (values.insurances || [])
        .filter((p) => p.provider || p.policyNumber || p.validTill)
        .map((p) => (p.validTill ? p : { ...p, validTill: undefined })),
    };

    try {
      await save(payload);
    } catch (err) {
      if (!isEdit && err.code === 'DUPLICATE_PATIENT') {
        setDuplicate({ existing: err.details?.existing, payload });
        return;
      }
      toast.error(err.message || 'Could not save patient');
    }
  };

  const confirmDuplicateAndSave = async () => {
    setConfirming(true);
    try {
      await save({ ...duplicate.payload, confirmDuplicate: true });
      setDuplicate(null);
    } catch (err) {
      toast.error(err.message || 'Could not save patient');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
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

        <div className="col-span-full mt-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Insurance Policies (optional)</h3>
          <button type="button" onClick={() => addPolicy(BLANK_POLICY)} className="inline-flex items-center gap-1 text-xs font-medium text-fg hover:underline">
            <Plus className="h-3.5 w-3.5" /> Add Policy
          </button>
        </div>
        {policyFields.length === 0 && (
          <p className="col-span-full text-sm text-muted">No insurance policies added.</p>
        )}
        {policyFields.map((field, i) => (
          <div key={field.id} className="col-span-full grid grid-cols-1 gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <Input id={`insProvider-${i}`} label="Provider" placeholder="Star Health" {...register(`insurances.${i}.provider`)} />
            <Input id={`insPolicy-${i}`} label="Policy Number" {...register(`insurances.${i}.policyNumber`)} />
            <Input id={`insValid-${i}`} type="date" label="Valid Till" {...register(`insurances.${i}.validTill`)} />
            <div className="flex items-end">
              <button type="button" onClick={() => removePolicy(i)} className="btn-ghost h-10 w-10 !p-0 text-red-500 hover:bg-red-500/10" aria-label="Remove policy">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </form>
    </Modal>

    <ConfirmDialog
      open={!!duplicate}
      onClose={() => setDuplicate(null)}
      onConfirm={confirmDuplicateAndSave}
      loading={confirming}
      danger={false}
      title="Possible duplicate patient"
      confirmLabel="Register anyway"
      message={
        duplicate?.existing
          ? `A patient with this phone number is already registered: ${duplicate.existing.fullName} (${duplicate.existing.uhid}, ${duplicate.existing.status}). Register a new, separate patient anyway?`
          : ''
      }
    />
    </>
  );
}
