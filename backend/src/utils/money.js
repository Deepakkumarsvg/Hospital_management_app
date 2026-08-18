// Money is stored as an integer number of paise, never as a floating-point
// number of rupees.
//
// Why: 0.1 + 0.2 !== 0.3 in binary floating point, and an invoice ledger adds
// up thousands of such numbers. The old code papered over the drift with
// Math.round(x * 100) / 100 after every operation and an EPSILON of half a
// paisa when comparing — which hides the error rather than removing it, and
// still loses to accumulation. Integers are exact: no rounding, no epsilon,
// and "paid === total" means exactly that.
//
// The wire format stays rupees. Requests carry rupees, responses carry rupees,
// and everything in between is paise — see toJSONRupees() for the boundary.

// Rupees (what a user typed, possibly with paise after the decimal point) to
// an exact integer of paise.
export function toPaise(rupees) {
  if (rupees === null || rupees === undefined || rupees === '') return 0;
  const n = Number(rupees);
  if (!Number.isFinite(n)) return 0;
  // Multiply in a form that survives the representation: 19.99 * 100 is
  // 1998.9999999999998, so round rather than truncate.
  return Math.round(n * 100);
}

// Paise back to rupees for display. The result is a Number carrying at most
// two decimal places, which is exactly representable for any realistic amount.
export function toRupees(paise) {
  if (paise === null || paise === undefined) return 0;
  const n = Number(paise);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n) / 100;
}

// Convert a whole object's money fields in place-ish (returns a new object),
// used for aggregation results, which never pass through a schema and so
// never get the toJSON treatment.
export function rupeesOf(obj, fields) {
  const out = { ...obj };
  for (const f of fields) out[f] = toRupees(out[f]);
  return out;
}

// Build a toJSON transform that converts stored paise back to rupees on the
// way out, so the API contract is unchanged by the switch.
//
// `fields` are top-level paths; `arrays` maps an array field name to the money
// fields inside its elements (e.g. { items: ['unitPrice', 'amount'] }).
export function toJSONRupees(fields = [], arrays = {}) {
  return function transform(_doc, ret) {
    for (const f of fields) {
      if (ret[f] !== undefined && ret[f] !== null) ret[f] = toRupees(ret[f]);
    }
    for (const [arrayName, innerFields] of Object.entries(arrays)) {
      if (!Array.isArray(ret[arrayName])) continue;
      for (const el of ret[arrayName]) {
        for (const f of innerFields) {
          if (el?.[f] !== undefined && el?.[f] !== null) el[f] = toRupees(el[f]);
        }
      }
    }
    return ret;
  };
}

// A Zod money field: accepts rupees off the wire and hands the service layer
// paise. Validators are the one place every HTTP request body passes through,
// which makes them the safest choke point for the conversion — a service can
// then assume paise unconditionally, with no "is this rupees or paise?" left
// anywhere behind the boundary.
//
// `base` is a plain Zod number schema carrying whatever range rules apply, so
// "must be positive" is still checked against the rupee value the user typed.
export const zodPaise = (base) => base.transform(toPaise);

// A money amount as it should be stored: a non-negative whole number of paise.
export const paiseField = (extra = {}) => ({
  type: Number,
  min: 0,
  default: 0,
  // A fractional paisa is not a thing. Catching it at the schema means a
  // rupee value that slipped past a conversion fails loudly instead of
  // silently re-introducing floats.
  validate: {
    validator: Number.isInteger,
    message: '{PATH} must be a whole number of paise',
  },
  ...extra,
});
