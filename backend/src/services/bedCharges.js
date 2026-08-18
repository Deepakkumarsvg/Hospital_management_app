// Working out what an inpatient owes for their bed.
//
// The rule is the one most hospitals actually bill on: you are charged for
// each NIGHT you occupy a bed, at the rate of the bed you are in when the
// midnight census is taken. A same-day admission and discharge crosses no
// midnight, so it is charged a single day — nobody occupies a bed for free.
//
// Counting nights rather than dividing the stay by 24 hours is what makes
// transfers come out right: moving wards at noon does not create two chargeable
// days out of one, because only one midnight is involved.
import { IPDAdmission } from '../models/IPDAdmission.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Local calendar day as YYYY-MM-DD — the key a charged night is recorded
// under, so the same night can never be billed twice.
export function dayKey(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Every midnight strictly after `from` and at or before `to`.
function midnightsBetween(from, to) {
  const out = [];
  const first = new Date(from);
  first.setHours(24, 0, 0, 0); // the next midnight after `from`
  for (let t = first.getTime(); t <= new Date(to).getTime(); t += DAY_MS) {
    out.push(new Date(t));
  }
  return out;
}

// The bed occupancy segments of an admission, oldest first.
//
// Admissions created before bed stays were recorded have none; for those the
// current bed is treated as having been held for the whole stay, which is
// exactly right for anyone who never transferred and the best available
// answer for anyone who did.
function staysOf(admission) {
  if (admission.bedStays?.length) return admission.bedStays;
  const bed = admission.bed;
  if (!bed) return [];
  return [{
    bed: bed._id || bed,
    ward: admission.ward,
    room: admission.room,
    bedNo: bed.bedNo || '',
    dailyCharge: bed.dailyCharge || 0,
    from: admission.admissionDate,
    to: admission.dischargeDate || null,
  }];
}

function stayCovering(stays, instant) {
  const t = new Date(instant).getTime();
  return stays.find((s) => {
    const from = new Date(s.from).getTime();
    const to = s.to ? new Date(s.to).getTime() : Infinity;
    return t > from && t <= to;
  }) || stays[stays.length - 1] || null;
}

// The nights this admission has accrued so far, one entry per night.
//
// `asOf` lets an interim bill be raised mid-stay: nights are only counted up
// to the moment asked about, never speculatively into the future.
export function accruedBedNights(admission, asOf = new Date()) {
  const stays = staysOf(admission);
  if (!stays.length) return [];

  const start = new Date(admission.admissionDate);
  const end = admission.dischargeDate ? new Date(admission.dischargeDate) : new Date(asOf);
  if (end < start) return [];

  const nights = midnightsBetween(start, end).map((midnight) => {
    const stay = stayCovering(stays, midnight);
    return {
      date: dayKey(midnight),
      bed: stay?.bed || null,
      bedNo: stay?.bedNo || '',
      dailyCharge: stay?.dailyCharge || 0,
    };
  });

  // A stay that crosses no midnight is still a day in a bed.
  if (!nights.length) {
    const stay = stays[0];
    return [{
      date: dayKey(start), bed: stay.bed, bedNo: stay.bedNo || '', dailyCharge: stay.dailyCharge || 0,
    }];
  }
  return nights;
}

// Identifies one chargeable night on an invoice line, so re-running the
// suggestion after an interim bill cannot offer the same night again.
export const bedNightKey = (admissionId, date) => `IPD_BED:${admissionId}:${date}`;

// Bed-charge lines for a patient that have not been billed yet. One line per
// unbilled night, so an interim bill mid-stay and the final bill at discharge
// between them cover the stay exactly once.
export async function unbilledBedCharges(patientId, billedKeys, atTariff = null) {
  const admissions = await IPDAdmission.find({
    patient: patientId,
    status: { $ne: 'CANCELLED' },
  }).populate({ path: 'bed', select: 'bedNo dailyCharge' });

  const lines = [];
  for (const adm of admissions) {
    for (const night of accruedBedNights(adm)) {
      const key = bedNightKey(adm._id, night.date);
      if (billedKeys.has(key)) continue;
      if (!night.dailyCharge) continue; // a free bed is not a billing error

      // The nightly rate is a catalogue price, so the patient's price list
      // applies to it — a CGHS bed and a cash bed are the same bed at two
      // different rates. The rate snapshotted on the stay stays the fallback.
      const rate = atTariff ? atTariff('BED', night.bed, night.dailyCharge) : night.dailyCharge;
      if (!rate) continue;

      lines.push({
        category: 'BED',
        description: `Bed charge · ${night.bedNo || 'ward bed'} · ${night.date} · ${adm.admissionNo}`,
        quantity: 1,
        unitPrice: rate,
        sourceType: 'IPD_BED',
        sourceKey: key,
      });
    }
  }
  return lines;
}
