import mongoose from 'mongoose';
import { Invoice } from '../models/Invoice.js';
import { Payment } from '../models/Payment.js';
import { Patient } from '../models/Patient.js';
import { LabOrder } from '../models/LabOrder.js';
import { RadiologyOrder } from '../models/RadiologyOrder.js';
import { MedicineDispense } from '../models/MedicineDispense.js';
import { Surgery } from '../models/Surgery.js';
import { BloodUnit } from '../models/BloodUnit.js';
import { AmbulanceTrip } from '../models/AmbulanceTrip.js';
import { OPDVisit } from '../models/OPDVisit.js';
import { ApiError } from '../utils/ApiError.js';
import { toRupees, toPaise } from '../utils/money.js';
import { unbilledBedCharges } from './bedCharges.js';
import { buildSearchFilter } from './searchFilters.js';
import { priceResolver } from './tariffService.js';
import { getSettings } from './settingService.js';
import { taxTreatmentForLine, stateCodeOfGstin } from '../config/gst.js';

const POPULATE = [
  { path: 'patient', select: 'uhid firstName lastName phone' },
  { path: 'createdBy', select: 'name' },
];

export async function listInvoices({ page, limit, search, status, patient }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (patient) filter.patient = patient;
  // Match on invoice number directly, or on the billed patient's name/UHID.
  Object.assign(filter, await buildSearchFilter(search, ['invoiceNo'], { patient: true }));

  const [items, total] = await Promise.all([
    Invoice.find(filter).populate(POPULATE).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Invoice.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function getInvoice(id) {
  const invoice = await Invoice.findById(id).populate(POPULATE);
  if (!invoice) throw ApiError.notFound('Invoice not found', 'INVOICE_NOT_FOUND');
  const payments = await Payment.find({ invoice: id }).populate('receivedBy', 'name').sort({ createdAt: -1 });
  return { invoice, payments };
}

// Every amount reaching this service is already paise — the validators convert
// at the HTTP boundary (see utils/money.js), and internal callers work in paise
// throughout. Nothing below multiplies or divides by 100.
//
// GST fields are filled in from the line's category when the caller hasn't
// stated them, so an ordinary bill needs no tax data entry at all and a line
// that genuinely differs can still say so. See config/gst.js.
const toStoredItems = (items = []) => items.map((it) => {
  const quantity = it.quantity || 1;
  const unitPrice = it.unitPrice || 0;
  const defaults = taxTreatmentForLine({ category: it.category, unitPrice });

  return {
    ...it,
    quantity,
    hsnSac: it.hsnSac ?? defaults.hsnSac,
    taxTreatment: it.taxTreatment ?? defaults.treatment,
    taxRatePercent: it.taxRatePercent ?? defaults.rate,
  };
});

// Where the supply happens, and therefore whether the tax splits CGST/SGST or
// goes to IGST.
//
// Almost every hospital bill is to somebody standing in the building, so the
// default is the hospital's own state. It only differs when a bill is raised to
// an out-of-state company or TPA, which announces itself through the GSTIN the
// caller supplies.
async function resolveSupply({ placeOfSupply, customerGstin }) {
  const settings = await getSettings().catch(() => null);
  const homeState = settings?.stateCode || stateCodeOfGstin(settings?.gstin) || '';

  const place = placeOfSupply
    || stateCodeOfGstin(customerGstin)
    || homeState;

  return {
    placeOfSupply: place,
    // Unknown on either side is treated as intra-state: CGST/SGST is the
    // overwhelmingly common case, and guessing inter-state would put the tax
    // under a head the hospital never collected.
    isInterState: Boolean(place && homeState && place !== homeState),
  };
}

export async function createInvoice(data, userId) {
  const patient = await Patient.findById(data.patient).select('_id');
  if (!patient) throw ApiError.badRequest('Patient does not exist', 'PATIENT_NOT_FOUND');

  const supply = await resolveSupply(data);

  const invoice = new Invoice({
    patient: data.patient,
    items: toStoredItems(data.items),
    discount: data.discount || 0,
    taxPercent: data.taxPercent || 0,
    customerGstin: data.customerGstin || '',
    ...supply,
    notes: data.notes || '',
    createdBy: userId,
  });
  invoice.recompute();
  await invoice.save();
  return invoice.populate(POPULATE);
}

// Items/discount/tax change the invoice's grand total — once any money has
// actually changed hands (paidAmount > 0) or the invoice is closed, those
// numbers must stay frozen. Refund first (via refundInvoice) if a correction
// is needed after payment. Only `notes` is exempt, since it carries no math.
export async function updateInvoice(id, data) {
  const invoice = await Invoice.findById(id);
  if (!invoice) throw ApiError.notFound('Invoice not found', 'INVOICE_NOT_FOUND');

  const changesMath = data.items !== undefined || data.discount !== undefined || data.taxPercent !== undefined;
  if (changesMath) {
    if (['REFUNDED', 'CANCELLED'].includes(invoice.status)) {
      throw ApiError.badRequest(`Cannot edit a ${invoice.status.toLowerCase()} invoice`, 'INVOICE_LOCKED');
    }
    if (invoice.paidAmount > 0) {
      throw ApiError.badRequest('Cannot change items, discount or tax after a payment has been recorded — refund first', 'INVOICE_HAS_PAYMENTS');
    }
  }

  if (data.items) invoice.items = toStoredItems(data.items);
  if (data.discount !== undefined) invoice.discount = data.discount;
  if (data.taxPercent !== undefined) invoice.taxPercent = data.taxPercent;
  if (data.notes !== undefined) invoice.notes = data.notes;
  invoice.recompute();
  await invoice.save();
  return invoice.populate(POPULATE);
}

// Void an invoice that nothing has been paid against yet. If any payment
// exists, it must be refunded first — cancelling is not a way to erase a
// paid bill.
export async function cancelInvoice(id, reason) {
  // Both preconditions live in the query: a payment landing at the same moment
  // as a cancellation must lose, not silently void a bill that has been paid.
  const invoice = await Invoice.findOneAndUpdate(
    { _id: id, status: { $nin: ['CANCELLED', 'REFUNDED'] }, paidAmount: { $lte: 0 } },
    [
      {
        $set: {
          status: 'CANCELLED',
          notes: reason
            ? {
                $cond: [
                  { $gt: [{ $strLenCP: { $ifNull: ['$notes', ''] } }, 0] },
                  { $concat: ['$notes', ' | Cancelled: ', reason] },
                  `Cancelled: ${reason}`,
                ],
              }
            : '$notes',
        },
      },
    ],
    { new: true }
  );

  if (!invoice) {
    const existing = await Invoice.findById(id).select('status paidAmount');
    if (!existing) throw ApiError.notFound('Invoice not found', 'INVOICE_NOT_FOUND');
    if (['CANCELLED', 'REFUNDED'].includes(existing.status)) {
      throw ApiError.badRequest(`Invoice is already ${existing.status.toLowerCase()}`, 'ALREADY_CLOSED');
    }
    throw ApiError.badRequest('Refund the payment before cancelling this invoice', 'INVOICE_HAS_PAYMENTS');
  }

  return invoice.populate(POPULATE);
}

// Refund some or all of what's been paid. Recorded as its own Payment
// (type: REFUND) for a full, symmetric audit trail — never a silent
// subtraction. A refund that empties paidAmount closes the invoice as
// REFUNDED; a partial refund just lowers paidAmount and lets recompute()
// re-derive PARTIAL/PENDING normally.
export async function refundInvoice(id, { amount, method, reason }, userId) {
  // Same shape as recordPayment: the "can't refund more than was paid" rule
  // lives in the query, so two concurrent refunds can't both draw on the same
  // paid balance.
  const invoice = await Invoice.findOneAndUpdate(
    {
      _id: id,
      status: { $ne: 'CANCELLED' },
      paidAmount: { $gte: amount, $gt: 0 },
    },
    [
      { $set: { paidAmount: { $subtract: ['$paidAmount', amount] } } },
      DERIVE_TOTALS_STAGE,
      // A refund that empties the invoice closes it as REFUNDED rather than
      // dropping back to PENDING — the money went out, it isn't owed again.
      { $set: { status: { $cond: [{ $lte: ['$paidAmount', 0] }, 'REFUNDED', '$status'] } } },
    ],
    { new: true }
  );

  if (!invoice) {
    const existing = await Invoice.findById(id).select('status paidAmount');
    if (!existing) throw ApiError.notFound('Invoice not found', 'INVOICE_NOT_FOUND');
    if (existing.status === 'CANCELLED') throw ApiError.badRequest('Cannot refund a cancelled invoice', 'INVOICE_CANCELLED');
    if (existing.paidAmount <= 0) throw ApiError.badRequest('Nothing has been paid on this invoice', 'NOTHING_PAID');
    throw ApiError.badRequest(`Refund cannot exceed the amount paid (₹${toRupees(existing.paidAmount)})`, 'REFUND_EXCEEDS_PAID');
  }

  try {
    // Recorded as its own Payment (type: REFUND) for a full, symmetric audit
    // trail — never a silent subtraction.
    const payment = await Payment.create({
      invoice: invoice._id, patient: invoice.patient,
      amount, type: 'REFUND', method: method || 'CASH', note: reason || '', receivedBy: userId,
    });
    return { invoice: await invoice.populate(POPULATE), payment };
  } catch (err) {
    await Invoice.findByIdAndUpdate(id, [
      { $set: { paidAmount: { $add: ['$paidAmount', amount] } } },
      DERIVE_TOTALS_STAGE,
    ]).catch(() => {});
    throw err;
  }
}

// Re-derive dueAmount and status from whatever paidAmount ends up being. Runs
// as a stage of the same update pipeline as the paidAmount change, so the
// invoice is never observable in a state where the three disagree.
//
// Every amount is an integer number of paise, so these are exact comparisons.
// This used to need an EPSILON of half a paisa and a $round on every result,
// because float arithmetic made "paid equals total" a question of degree.
const DERIVE_TOTALS_STAGE = {
  $set: {
    dueAmount: { $subtract: ['$grandTotal', '$paidAmount'] },
    status: {
      $switch: {
        branches: [
          { case: { $lte: ['$paidAmount', 0] }, then: 'PENDING' },
          { case: { $lt: ['$paidAmount', '$grandTotal'] }, then: 'PARTIAL' },
        ],
        default: 'PAID',
      },
    },
  },
};

// Record a payment and roll it up into the invoice.
//
// The invoice is updated FIRST, with the overpayment rule expressed as part of
// the query. Reading the invoice, checking the due amount and then writing
// would let two concurrent payments each see the full amount outstanding and
// both go through.
export async function recordPayment(invoiceId, data, userId) {
  const { amount } = data;

  const invoice = await Invoice.findOneAndUpdate(
    {
      _id: invoiceId,
      status: { $nin: ['REFUNDED', 'CANCELLED'] },
      // paidAmount + amount must not exceed the grand total.
      $expr: { $lte: [{ $add: ['$paidAmount', amount] }, '$grandTotal'] },
    },
    [
      { $set: { paidAmount: { $add: ['$paidAmount', amount] } } },
      DERIVE_TOTALS_STAGE,
    ],
    { new: true }
  );

  if (!invoice) {
    // Nothing matched — work out which rule turned it down.
    const existing = await Invoice.findById(invoiceId).select('status dueAmount');
    if (!existing) throw ApiError.notFound('Invoice not found', 'INVOICE_NOT_FOUND');
    if (['REFUNDED', 'CANCELLED'].includes(existing.status)) {
      throw ApiError.badRequest(`Cannot pay a ${existing.status.toLowerCase()} invoice`, 'INVOICE_LOCKED');
    }
    throw ApiError.badRequest(`Amount exceeds due (₹${toRupees(existing.dueAmount)})`, 'OVERPAYMENT');
  }

  try {
    const payment = await Payment.create({
      invoice: invoice._id, patient: invoice.patient,
      amount, method: data.method || 'CASH',
      transactionId: data.transactionId || '', note: data.note || '', receivedBy: userId,
    });
    return { invoice: await invoice.populate(POPULATE), payment };
  } catch (err) {
    // The receipt is what makes the payment auditable. If it can't be written,
    // the invoice must not claim the money was received.
    await Invoice.findByIdAndUpdate(invoiceId, [
      { $set: { paidAmount: { $subtract: ['$paidAmount', amount] } } },
      DERIVE_TOTALS_STAGE,
    ]).catch(() => {});

    // A duplicate transactionId means this exact gateway payment has already
    // been banked — the client's verify call and the webhook both arrived.
    // That's an expected race, not a failure, so it gets its own code.
    if (err?.code === 11000 && err.keyPattern?.transactionId) {
      throw ApiError.conflict(
        'This payment has already been recorded',
        'PAYMENT_ALREADY_RECORDED',
        { transactionId: data.transactionId }
      );
    }
    throw err;
  }
}

// Suggested billable lines drawn from everywhere in the hospital that earns
// money on a patient's behalf — diagnostics, pharmacy, the bed they slept in,
// theatre time, blood, ambulance trips and the consultation itself.
//
// Anything already billed on a non-cancelled invoice is excluded, so re-opening
// "Add suggested charges" can never bill the same thing twice. Most sources are
// matched on the source document's id; bed nights are matched on a finer key
// because a stay is billed a night at a time.
//
// Amounts here are RUPEES: they are read from catalogue/operational models that
// are not paise-denominated, and they go back out to the client, which posts
// them to createInvoice through the validators that do the conversion.
export async function billingSuggestions(patientId) {
  const [labs, rads, dispenses, surgeries, bloodUnits, trips, visits, billedRows] = await Promise.all([
    LabOrder.find({ patient: patientId, status: { $ne: 'CANCELLED' } }),
    RadiologyOrder.find({ patient: patientId, status: { $ne: 'CANCELLED' } }),
    MedicineDispense.find({ patient: patientId }),
    Surgery.find({ patient: patientId, status: 'COMPLETED' }).populate('theatre', 'name'),
    BloodUnit.find({ issuedTo: patientId, status: 'ISSUED' }),
    AmbulanceTrip.find({ patient: patientId, status: 'COMPLETED' }),
    OPDVisit.find({ patient: patientId, status: { $ne: 'CANCELLED' } })
      .populate('doctor', 'firstName lastName consultationFee'),
    Invoice.aggregate([
      { $match: { patient: new mongoose.Types.ObjectId(patientId), status: { $ne: 'CANCELLED' } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: null,
          ids: { $addToSet: '$items.sourceId' },
          keys: { $addToSet: '$items.sourceKey' },
        },
      },
    ]),
  ]);

  const billed = new Set((billedRows[0]?.ids || []).filter(Boolean).map(String));
  const billedKeys = new Set((billedRows[0]?.keys || []).filter(Boolean));

  // What this patient's payer actually pays. Applied only where the price is
  // looked up from a catalogue AT BILLING TIME — a lab test, an X-ray, a
  // consultation, a bed. Amounts already transacted at the counter (a dispense
  // total, the charge entered when blood was issued, an ambulance fare) are
  // records of what happened, not prices to re-derive, and re-pricing them here
  // would make the bill disagree with the receipt the patient already has.
  //
  // Rates are stored in paise; these suggestions are in rupees, because the
  // catalogues they come from are. See utils/money.js.
  const priced = await priceResolver(patientId);
  const atTariff = (serviceType, serviceId, catalogRupees) =>
    toRupees(priced(serviceType, serviceId, toPaise(catalogRupees)));

  const suggestions = [];
  const add = (line) => { if (line.unitPrice > 0) suggestions.push(line); };

  for (const l of labs) {
    if (billed.has(String(l._id))) continue;
    const amt = (l.items || []).reduce(
      (sum, i) => sum + (i.test ? atTariff('LAB_TEST', i.test, i.price || 0) : (i.price || 0)),
      0
    );
    add({ category: 'LABORATORY', description: `Lab · ${l.orderNo}`, quantity: 1, unitPrice: amt, sourceType: 'LAB_ORDER', sourceId: l._id });
  }
  for (const r of rads) {
    if (billed.has(String(r._id))) continue;
    const price = r.test ? atTariff('RAD_TEST', r.test, r.price) : r.price;
    add({ category: 'RADIOLOGY', description: `${r.testName} · ${r.orderNo}`, quantity: 1, unitPrice: price, sourceType: 'RAD_ORDER', sourceId: r._id });
  }
  for (const d of dispenses) {
    if (billed.has(String(d._id))) continue;
    add({ category: 'MEDICINE', description: `Pharmacy · ${d.dispenseNo}`, quantity: 1, unitPrice: d.total, sourceType: 'DISPENSE', sourceId: d._id });
  }
  for (const s of surgeries) {
    if (billed.has(String(s._id))) continue;
    const theatre = s.theatre?.name ? ` · ${s.theatre.name}` : '';
    add({ category: 'SURGERY', description: `${s.procedure}${theatre} · ${s.surgeryNo}`, quantity: 1, unitPrice: s.charges, sourceType: 'SURGERY', sourceId: s._id });
  }
  for (const u of bloodUnits) {
    if (billed.has(String(u._id))) continue;
    add({ category: 'PROCEDURE', description: `Blood · ${u.bloodGroup} ${u.component} · ${u.unitNo}`, quantity: 1, unitPrice: u.chargeAmount, sourceType: 'BLOOD_UNIT', sourceId: u._id });
  }
  for (const t of trips) {
    if (billed.has(String(t._id))) continue;
    add({ category: 'OTHER', description: `Ambulance · ${t.tripNo}`, quantity: 1, unitPrice: t.charges, sourceType: 'AMBULANCE_TRIP', sourceId: t._id });
  }
  for (const v of visits) {
    if (billed.has(String(v._id))) continue;
    const doctor = v.doctor ? `Dr. ${[v.doctor.firstName, v.doctor.lastName].filter(Boolean).join(' ')}` : 'Consultation';
    const fee = v.doctor
      ? atTariff('CONSULTATION', v.doctor._id, v.doctor.consultationFee || 0)
      : 0;
    add({ category: 'CONSULTATION', description: `${doctor} · ${v.visitNo}`, quantity: 1, unitPrice: fee, sourceType: 'OPD_CONSULT', sourceId: v._id });
  }

  // Bed nights come last so the bill reads procedures-then-stay, and are the
  // one source keyed per night rather than per document.
  suggestions.push(...await unbilledBedCharges(patientId, billedKeys, atTariff));

  return suggestions;
}

export async function billingStats() {
  const rows = await Invoice.aggregate([
    { $match: { status: { $nin: ['CANCELLED'] } } },
    { $group: { _id: null, billed: { $sum: '$grandTotal' }, collected: { $sum: '$paidAmount' }, due: { $sum: '$dueAmount' } } },
  ]);
  const agg = rows[0] || { billed: 0, collected: 0, due: 0 };
  const pending = await Invoice.countDocuments({ status: { $in: ['PENDING', 'PARTIAL'] } });
  // Aggregation results never pass through a schema, so the paise-to-rupees
  // conversion that toJSON does for documents has to happen by hand here.
  return {
    billed: toRupees(agg.billed),
    collected: toRupees(agg.collected),
    due: toRupees(agg.due),
    pendingInvoices: pending,
  };
}
