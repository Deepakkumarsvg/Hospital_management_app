import { useEffect, useState } from 'react';
import { Plus, Trash2, Sparkles } from 'lucide-react';
import Modal from '../../components/ui/Modal.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Button from '../../components/ui/Button.jsx';
import PatientPicker from '../appointments/PatientPicker.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { createInvoice, billingSuggestions } from '../../services/billingService.js';
import { INVOICE_CATEGORY_OPTIONS, money } from '../../utils/constants.js';

const EMPTY_LINE = { category: 'CONSULTATION', description: '', quantity: 1, unitPrice: '' };

export default function NewInvoice({ open, onClose, onCreated, presetPatient }) {
  const toast = useToast();
  const [patient, setPatient] = useState(null);
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
  const [discount, setDiscount] = useState('');
  const [taxPercent, setTaxPercent] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPatient(presetPatient || null); setLines([{ ...EMPTY_LINE }]); setDiscount(''); setTaxPercent(''); setSuggestions([]); setErrors({});
  }, [open, presetPatient]);

  useEffect(() => {
    if (patient) billingSuggestions(patient.id || patient._id).then(setSuggestions).catch(() => setSuggestions([]));
    else setSuggestions([]);
  }, [patient]);

  const setLine = (i, k, v) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  const addSuggested = () => {
    setLines((prev) => {
      const base = prev.filter((l) => l.description.trim());
      return [...base, ...suggestions.map((s) => ({ category: s.category, description: s.description, quantity: 1, unitPrice: s.unitPrice }))];
    });
    toast.success(`Added ${suggestions.length} charge${suggestions.length === 1 ? '' : 's'}`);
  };

  const subtotal = lines.reduce((s, l) => s + ((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0)), 0);
  const taxable = Math.max(0, subtotal - (Number(discount) || 0));
  const tax = taxable * ((Number(taxPercent) || 0) / 100);
  const grandTotal = taxable + tax;

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (!patient) er.patient = 'Select a patient';
    const items = lines.filter((l) => l.description.trim() && Number(l.unitPrice) >= 0)
      .map((l) => ({ category: l.category, description: l.description, quantity: Number(l.quantity) || 1, unitPrice: Number(l.unitPrice) || 0 }));
    if (items.length === 0) er.items = 'Add at least one line item';
    setErrors(er);
    if (Object.keys(er).length) return;

    setSaving(true);
    try {
      const inv = await createInvoice({ patient: patient.id || patient._id, items, discount: Number(discount) || 0, taxPercent: Number(taxPercent) || 0 });
      toast.success(`Invoice created · ${inv.invoiceNo}`);
      onCreated(inv); onClose();
    } catch (err) { toast.error(err.message || 'Failed'); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} size="2xl" title="New Invoice"
      footer={<>
        <span className="mr-auto text-sm font-medium">Total: {money(grandTotal)}</span>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" form="inv-f" loading={saving}>Create Invoice</Button>
      </>}>
      <form id="inv-f" onSubmit={submit} className="space-y-4" noValidate>
        <PatientPicker value={patient} onChange={setPatient} error={errors.patient} />

        {suggestions.length > 0 && (
          <button type="button" onClick={addSuggested} className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-sm text-muted hover:text-fg">
            <Sparkles className="h-4 w-4" /> Add {suggestions.length} suggested charge{suggestions.length === 1 ? '' : 's'} from lab / radiology / pharmacy
          </button>
        )}

        <div className="space-y-2">
          <label className="label">Line Items {errors.items && <span className="text-red-500">· {errors.items}</span>}</label>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <Select className="col-span-3" options={INVOICE_CATEGORY_OPTIONS} value={l.category} onChange={(e) => setLine(i, 'category', e.target.value)} />
              <Input className="col-span-4" placeholder="Description" value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} />
              <Input className="col-span-2" type="number" min="1" placeholder="Qty" value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} />
              <Input className="col-span-2" type="number" step="0.01" placeholder="Unit ₹" value={l.unitPrice} onChange={(e) => setLine(i, 'unitPrice', e.target.value)} />
              <button type="button" onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} className="btn-ghost col-span-1 h-10 w-10 !p-0 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button type="button" variant="outline" className="h-8" onClick={() => setLines((p) => [...p, { ...EMPTY_LINE }])}><Plus className="h-4 w-4" /> Add Line</Button>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
          <Input type="number" step="0.01" label="Discount ₹" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          <Input type="number" step="0.01" label="Tax %" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} />
          <div className="col-span-2 rounded-lg bg-surface p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="tabular-nums">{money(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Discount</span><span className="tabular-nums">− {money(Number(discount) || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Tax</span><span className="tabular-nums">+ {money(tax)}</span></div>
            <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold"><span>Grand Total</span><span className="tabular-nums">{money(grandTotal)}</span></div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
