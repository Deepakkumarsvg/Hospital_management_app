import mongoose from "mongoose";
import { register } from "../db/registry.js";
import { tenantModel } from "../db/tenantModel.js";
import { Counter } from './Counter.js';
import { paiseField, toJSONRupees } from '../utils/money.js';
import { TAX_TREATMENTS, splitTax } from '../config/gst.js';

export const INVOICE_ITEM_CATEGORIES = [
  'CONSULTATION', 'ROOM', 'BED', 'LABORATORY', 'RADIOLOGY', 'MEDICINE', 'PROCEDURE', 'SURGERY', 'OTHER',
];
export const INVOICE_STATUSES = ['PENDING', 'PARTIAL', 'PAID', 'REFUNDED', 'CANCELLED'];

// Every part of the hospital that generates a charge. A source that isn't
// listed here is a source whose revenue nothing collects.
export const INVOICE_ITEM_SOURCES = [
  'LAB_ORDER', 'RAD_ORDER', 'DISPENSE',
  'IPD_BED', 'SURGERY', 'BLOOD_UNIT', 'AMBULANCE_TRIP', 'OPD_CONSULT',
];

const invoiceItemSchema = new mongoose.Schema(
  {
    category: { type: String, enum: INVOICE_ITEM_CATEGORIES, default: 'OTHER' },
    description: { type: String, required: true, trim: true },
    quantity: { type: Number, min: 1, default: 1 },
    // Paise. See utils/money.js.
    unitPrice: paiseField(),
    amount: paiseField(),
    // Set when this line came from a "suggested charge" — lets
    // billingSuggestions() avoid offering the same charge twice.
    sourceType: { type: String, enum: INVOICE_ITEM_SOURCES, default: null },
    // Most sources are billed once and whole, so the source document's id
    // identifies them.
    sourceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Some sources are billed in instalments rather than all at once — a bed
    // accrues one charge per night, and an interim bill mid-stay must not
    // block the rest of the stay from ever being billed. Those carry a finer
    // key (e.g. "IPD_BED:<admission>:<date>") instead of a bare document id.
    sourceKey: { type: String, default: '', index: true },

    // --- GST -----------------------------------------------------------------
    //
    // Per line, because one hospital bill routinely mixes exempt clinical
    // services with taxable pharmacy items. See config/gst.js.
    hsnSac: { type: String, trim: true, default: '' },
    taxTreatment: { type: String, enum: TAX_TREATMENTS, default: 'EXEMPT' },
    taxRatePercent: { type: Number, min: 0, max: 28, default: 0 },

    // Derived by recompute(); never set by hand.
    //
    // taxableValue is the line's share of the bill AFTER the invoice-level
    // discount has been apportioned to it — tax is charged on what was actually
    // billed, not on the list price.
    taxableValue: paiseField(),
    cgst: paiseField(),
    sgst: paiseField(),
    igst: paiseField(),
    taxAmount: paiseField(),
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, unique: true, index: true }, // INV-YYYY-000001
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    items: { type: [invoiceItemSchema], default: [] },
    // All amounts below are paise. See utils/money.js.
    subtotal: paiseField(),
    discount: paiseField(),                              // flat amount

    // --- GST ------------------------------------------------------------------
    //
    // Where the supply is deemed to happen. When it matches the hospital's own
    // state the tax is split CGST/SGST; otherwise it is IGST. Defaults to the
    // hospital's state, which is what an ordinary walk-in patient is.
    placeOfSupply: { type: String, trim: true, default: '' }, // two-digit state code
    isInterState: { type: Boolean, default: false },
    // The patient's GSTIN, when the bill is raised to a company or a TPA rather
    // than to an individual. Blank on a B2C bill, which is most of them.
    customerGstin: { type: String, trim: true, uppercase: true, default: '' },

    // Rolled up from the lines by recompute().
    taxableValue: paiseField(),   // the part of the bill GST applies to
    exemptValue: paiseField(),    // the part it does not — reported separately
    totalCgst: paiseField(),
    totalSgst: paiseField(),
    totalIgst: paiseField(),

    // `tax` is the sum of the three heads. Kept under its original name because
    // it is what every existing caller, PDF and export reads.
    tax: paiseField(),

    // A single rate for the whole bill cannot express a hospital invoice, which
    // mixes exempt and taxable lines — that is what the per-line fields above
    // are for. Retained so bills raised before the change still recompute to
    // the totals they were issued with, and applied only when no line states a
    // treatment of its own.
    taxPercent: { type: Number, min: 0, max: 100, default: 0 },

    grandTotal: paiseField(),
    paidAmount: paiseField(),
    dueAmount: paiseField({ min: undefined }), // may go negative mid-correction
    status: { type: String, enum: INVOICE_STATUSES, default: 'PENDING', index: true },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// The wire format is rupees — storage is the only thing that changed.
const MONEY_FIELDS = [
  'subtotal', 'discount', 'tax', 'grandTotal', 'paidAmount', 'dueAmount',
  'taxableValue', 'exemptValue', 'totalCgst', 'totalSgst', 'totalIgst',
];
const ITEM_MONEY_FIELDS = ['unitPrice', 'amount', 'taxableValue', 'cgst', 'sgst', 'igst', 'taxAmount'];
invoiceSchema.set('toJSON', {
  virtuals: true,
  transform: toJSONRupees(MONEY_FIELDS, { items: ITEM_MONEY_FIELDS }),
});

// Spread an invoice-level discount across the lines, in whole paise.
//
// Tax is charged per line on what was actually billed, so a discount on the
// bill has to become a discount on each line before any tax can be worked out.
// Proportional shares almost never divide evenly, so the remainder is handed to
// the largest line: the parts must add back up to the whole exactly, or the
// invoice total and the sum of its lines disagree.
function apportion(discount, amounts) {
  const total = amounts.reduce((s, a) => s + a, 0);
  if (!discount || total <= 0) return amounts.map(() => 0);
  if (discount >= total) return [...amounts]; // discount swallows the bill

  const shares = amounts.map((a) => Math.floor((a * discount) / total));
  let remainder = discount - shares.reduce((s, v) => s + v, 0);

  // Give the leftover paise to the biggest lines first — the least surprising
  // place for a rounding crumb to land.
  const order = amounts
    .map((a, i) => [a, i])
    .sort((x, y) => y[0] - x[0])
    .map(([, i]) => i);

  for (let k = 0; remainder > 0; k = (k + 1) % order.length) {
    shares[order[k]] += 1;
    remainder -= 1;
  }
  return shares;
}

// Recompute every derived money field from items + discount + tax + paidAmount.
//
// Every value here is an integer number of paise, so the arithmetic is exact and
// the comparisons below are true equality — no epsilon, no drift. The only
// rounding is on a tax line, where a percentage genuinely can land between two
// paise; it is rounded once, per line, to the nearest paisa.
invoiceSchema.methods.recompute = function () {
  this.items.forEach((it) => { it.amount = it.quantity * it.unitPrice; });
  this.subtotal = this.items.reduce((s, it) => s + it.amount, 0);

  const discountShares = apportion(this.discount, this.items.map((it) => it.amount));

  // A bill raised before per-line tax existed carries only a whole-invoice
  // rate. Honouring it here — and only when no line says otherwise — means such
  // an invoice still recomputes to the total it was issued with.
  const legacyRate = this.taxPercent > 0 && !this.items.some((it) => it.taxTreatment === 'TAXABLE')
    ? this.taxPercent
    : 0;

  let taxableValue = 0;
  let exemptValue = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  this.items.forEach((it, i) => {
    const net = Math.max(0, it.amount - discountShares[i]);
    it.taxableValue = net;

    const rate = it.taxTreatment === 'TAXABLE' ? it.taxRatePercent : legacyRate;
    const tax = rate > 0 ? Math.round((net * rate) / 100) : 0;

    const { cgst, sgst, igst } = splitTax(tax, this.isInterState);
    it.cgst = cgst;
    it.sgst = sgst;
    it.igst = igst;
    it.taxAmount = tax;

    // EXEMPT and NIL_RATED both carry no tax, but only EXEMPT sits outside GST
    // altogether — they are reported on different lines of a GST return, so the
    // invoice keeps them apart.
    if (it.taxTreatment === 'EXEMPT' && !legacyRate) exemptValue += net;
    else taxableValue += net;

    totalCgst += cgst;
    totalSgst += sgst;
    totalIgst += igst;
  });

  this.taxableValue = taxableValue;
  this.exemptValue = exemptValue;
  this.totalCgst = totalCgst;
  this.totalSgst = totalSgst;
  this.totalIgst = totalIgst;
  this.tax = totalCgst + totalSgst + totalIgst;

  this.grandTotal = Math.max(0, this.subtotal - this.discount) + this.tax;
  this.dueAmount = this.grandTotal - this.paidAmount;

  if (this.status === 'REFUNDED' || this.status === 'CANCELLED') return;
  if (this.paidAmount <= 0) this.status = 'PENDING';
  else if (this.paidAmount < this.grandTotal) this.status = 'PARTIAL';
  else this.status = 'PAID';
};

invoiceSchema.pre('save', async function (next) {
  if (this.invoiceNo) return next();
  try {
    const year = new Date().getFullYear();
    const seq = await Counter.next(`invoice-${year}`);
    this.invoiceNo = `INV-${year}-${String(seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

register("Invoice", invoiceSchema);
export const Invoice = tenantModel("Invoice");
