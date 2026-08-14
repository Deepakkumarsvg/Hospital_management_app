import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import Modal from '../../components/ui/Modal.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Button from '../../components/ui/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { createMedicine, updateMedicine } from '../../services/pharmacyService.js';
import { MEDICINE_UNIT_OPTIONS, PATIENT_STATUS_OPTIONS } from '../../utils/constants.js';

export default function MedicineForm({ open, onClose, medicine, onSaved }) {
  const toast = useToast();
  const isEdit = !!medicine;
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();
  useEffect(() => {
    if (open) reset(medicine || { name: '', genericName: '', category: 'General', manufacturer: '', unit: 'TABLET', mrp: 0, purchasePrice: 0, sellingPrice: 0, minStock: 10, status: 'ACTIVE' });
  }, [open, medicine, reset]);

  const onSubmit = async (v) => {
    try {
      isEdit ? await updateMedicine(medicine.id || medicine._id, v) : await createMedicine(v);
      toast.success(isEdit ? 'Medicine updated' : 'Medicine added'); onSaved(); onClose();
    } catch (err) { toast.error(err.message || 'Failed'); }
  };

  return (
    <Modal open={open} onClose={onClose} size="2xl" title={isEdit ? 'Edit Medicine' : 'New Medicine'}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="med-f" loading={isSubmitting}>{isEdit ? 'Save' : 'Create'}</Button></>}>
      <form id="med-f" onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-4 sm:grid-cols-3" noValidate>
        <Input label="Name *" className="col-span-2 sm:col-span-1" error={errors.name?.message} {...register('name', { required: 'Required' })} />
        <Input label="Generic Name" {...register('genericName')} />
        <Input label="Category" {...register('category')} />
        <Input label="Manufacturer" {...register('manufacturer')} />
        <Select label="Unit" options={MEDICINE_UNIT_OPTIONS} {...register('unit')} />
        <Input label="Min Stock" type="number" {...register('minStock')} />
        <Input label="MRP ₹" type="number" step="0.01" {...register('mrp')} />
        <Input label="Purchase ₹" type="number" step="0.01" {...register('purchasePrice')} />
        <Input label="Selling ₹" type="number" step="0.01" {...register('sellingPrice')} />
        {isEdit && <Select label="Status" options={PATIENT_STATUS_OPTIONS} {...register('status')} />}
      </form>
    </Modal>
  );
}
