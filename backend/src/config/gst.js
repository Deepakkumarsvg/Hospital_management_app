// GST as it actually applies to an Indian hospital.
//
// The invoice used to carry a single `taxPercent` for the whole bill, which
// cannot represent what a hospital actually issues. Healthcare services provided
// by a clinical establishment are EXEMPT (Notification 12/2017-CT(R), entry 74),
// while the pharmacy counter next to it is fully taxable — so one bill routinely
// mixes exempt and taxable lines, and a single rate for all of them is wrong in
// both directions at once.
//
// The other half the old model could not express is the CGST/SGST vs IGST split.
// The tax is the same either way; which heads it is collected under depends on
// whether the place of supply matches the hospital's own state, and an invoice
// that does not break it out is not a tax invoice.
//
// NOTE: rates and exemptions here are the common defaults, not tax advice. They
// are all overridable per line, because the edge cases (which cosmetic procedure
// counts as reconstructive, which implant sits in which schedule) are decisions
// for the hospital's accountant, not for this file.

// A line is one of three things, and "0%" is not a single answer:
//   EXEMPT    — outside GST (most clinical services). No tax, and it does not
//               count toward taxable turnover.
//   NIL_RATED — inside GST at 0%.
//   TAXABLE   — inside GST at taxRatePercent.
// The distinction matters on GSTR-1, which reports them on different lines.
export const TAX_TREATMENTS = ['EXEMPT', 'NIL_RATED', 'TAXABLE'];

// The slabs GST actually has. An arbitrary percentage is a data-entry error.
export const GST_RATES = [0, 5, 12, 18, 28];

// Room rent is exempt only up to a threshold — above it, 5% applies (the 2022
// change to entry 74). Expressed in paise per day, like every other amount.
export const ROOM_RENT_EXEMPTION_LIMIT_PAISE = Number(
  process.env.GST_ROOM_RENT_EXEMPTION_PAISE ?? 500000 // ₹5,000/day
);
export const ROOM_RENT_TAX_RATE = 5;

// What each kind of charge defaults to. Overridable per line.
//
// SAC 9993 covers human health services; 3004 is the HSN for packaged
// medicaments. They are defaults so the common bill needs no data entry, not a
// claim that every line of that category carries that code.
export const CATEGORY_TAX_DEFAULTS = {
  CONSULTATION: { treatment: 'EXEMPT', rate: 0, hsnSac: '9993' },
  // Room and bed start exempt and are re-evaluated against the daily
  // threshold — see taxTreatmentForLine().
  ROOM: { treatment: 'EXEMPT', rate: 0, hsnSac: '9993' },
  BED: { treatment: 'EXEMPT', rate: 0, hsnSac: '9993' },
  LABORATORY: { treatment: 'EXEMPT', rate: 0, hsnSac: '9993' },
  RADIOLOGY: { treatment: 'EXEMPT', rate: 0, hsnSac: '9993' },
  SURGERY: { treatment: 'EXEMPT', rate: 0, hsnSac: '9993' },
  PROCEDURE: { treatment: 'EXEMPT', rate: 0, hsnSac: '9993' },
  // Goods, not healthcare services — the pharmacy counter is a supply like any
  // other. 12% is the commonest medicament slab; insulin and a few others are
  // 5%, so this is a default rather than a rule.
  MEDICINE: { treatment: 'TAXABLE', rate: 12, hsnSac: '3004' },

  // Uncategorised lines are EXEMPT, not taxable.
  //
  // The tempting default here is 18%, on the grounds that anything which isn't
  // healthcare probably is taxable. That gets it backwards: a default that
  // invents tax silently adds a charge to bills nobody meant to tax, and the
  // patient is the one who pays it. A default that omits tax is visible — the
  // line reads "Exempt" on the invoice, and anyone reviewing it can say so.
  //
  // A taxable "other" line therefore has to declare itself, which is a
  // deliberate act rather than an oversight.
  OTHER: { treatment: 'EXEMPT', rate: 0, hsnSac: '' },
};

export const taxDefaultsFor = (category) =>
  CATEGORY_TAX_DEFAULTS[category] || CATEGORY_TAX_DEFAULTS.OTHER;

/**
 * Work out a line's treatment when the caller hasn't stated one.
 *
 * Bed charges are the one category that cannot be answered from the category
 * alone: the same ward is exempt at ₹4,000 a night and taxable at ₹6,000, so the
 * per-day rate decides.
 */
export function taxTreatmentForLine({ category, unitPrice = 0 }) {
  const base = taxDefaultsFor(category);

  if ((category === 'BED' || category === 'ROOM') && unitPrice > ROOM_RENT_EXEMPTION_LIMIT_PAISE) {
    return { ...base, treatment: 'TAXABLE', rate: ROOM_RENT_TAX_RATE };
  }
  return base;
}

/**
 * Split a tax amount into the heads it is collected under.
 *
 * Intra-state supply is halved into CGST and SGST; inter-state is all IGST.
 *
 * The halving uses floor + remainder rather than rounding twice, because an odd
 * number of paise rounded twice produces two halves that do not add back up to
 * the whole — and a tax invoice whose CGST + SGST differs from its total tax by
 * a paisa is a tax invoice that fails validation.
 */
export function splitTax(taxPaise, isInterState) {
  if (!taxPaise) return { cgst: 0, sgst: 0, igst: 0 };
  if (isInterState) return { cgst: 0, sgst: 0, igst: taxPaise };

  const cgst = Math.floor(taxPaise / 2);
  return { cgst, sgst: taxPaise - cgst, igst: 0 };
}

// Indian state codes, as used for place of supply. The first two digits of a
// GSTIN are the state code, which is what makes intra/inter-state derivable
// from the two parties' numbers alone.
export const STATE_CODES = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan',
  '09': 'Uttar Pradesh', 10: 'Bihar', 11: 'Sikkim', 12: 'Arunachal Pradesh',
  13: 'Nagaland', 14: 'Manipur', 15: 'Mizoram', 16: 'Tripura',
  17: 'Meghalaya', 18: 'Assam', 19: 'West Bengal', 20: 'Jharkhand',
  21: 'Odisha', 22: 'Chhattisgarh', 23: 'Madhya Pradesh', 24: 'Gujarat',
  26: 'Dadra & Nagar Haveli and Daman & Diu', 27: 'Maharashtra', 29: 'Karnataka',
  30: 'Goa', 31: 'Lakshadweep', 32: 'Kerala', 33: 'Tamil Nadu',
  34: 'Puducherry', 35: 'Andaman & Nicobar Islands', 36: 'Telangana',
  37: 'Andhra Pradesh', 38: 'Ladakh', 97: 'Other Territory',
};

// A GSTIN is 15 characters: 2 state + 10 PAN + 1 entity + 'Z' + 1 checksum.
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export const stateCodeOfGstin = (gstin) =>
  (GSTIN_PATTERN.test(String(gstin || '').toUpperCase()) ? String(gstin).slice(0, 2) : '');
