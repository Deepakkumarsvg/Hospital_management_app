// Searching a list by the name of the patient or doctor it references.
//
// The old shape, repeated in six services, was:
//
//   const patients = await Patient.find({ firstName: rx }).select('_id');
//   filter.$or = [{ patient: { $in: patients.map(p => p._id) } }];
//
// with no limit anywhere. On a real patient list, searching "a" loads every
// matching id into the API process and then asks MongoDB to match against an
// $in of that size. At a hundred thousand patients that is a request that
// allocates megabytes and a query the server cannot plan usefully — it is the
// single most reliable way to take this system down.
//
// The fix is to cap the lookup. A search box exists to narrow a list far enough
// to find one row; a term that matches ten thousand patients has not narrowed
// anything, and the honest answer is "be more specific" rather than an outage.
// The cap is generous enough that no realistic search reaches it.
import { Patient } from '../models/Patient.js';
import { Doctor } from '../models/Doctor.js';

// How many referenced records a search may pull in before it stops being a
// search. Deliberately well above what a usable search returns.
const MAX_REFERENCED = 500;

export function escapeRegex(term) {
  return String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Anchored at the start of the field, which is both what people mean when they
// type a name and what lets MongoDB use the index on it. An unanchored regex
// cannot use one at all, so the old queries scanned the whole collection twice
// over: once here and once for the outer query.
export const prefixRegex = (term) => new RegExp(`^${escapeRegex(term)}`, 'i');

// Ids of documents in `Model` matching `term` on any of `fields`, capped.
//
// Exported for the references the helper below doesn't special-case (vehicles,
// vendors) so those get the same cap rather than reinventing the unbounded
// version next to it.
export async function cappedIds(Model, fields, term) {
  const rx = prefixRegex(term);
  const rows = await Model.find({ $or: fields.map((f) => ({ [f]: rx })) })
    .select('_id')
    .limit(MAX_REFERENCED)
    .lean();
  return rows.map((r) => r._id);
}

async function matchingPatientIds(term) {
  const rx = prefixRegex(term);
  const rows = await Patient.find({ $or: [{ firstName: rx }, { lastName: rx }, { uhid: rx }, { phone: rx }] })
    .select('_id')
    .limit(MAX_REFERENCED)
    .lean();
  return rows.map((r) => r._id);
}

async function matchingDoctorIds(term) {
  const rx = prefixRegex(term);
  const rows = await Doctor.find({ $or: [{ firstName: rx }, { lastName: rx }] })
    .select('_id')
    .limit(MAX_REFERENCED)
    .lean();
  return rows.map((r) => r._id);
}

/**
 * Build the $or clause for a list search.
 *
 * @param search      the term typed
 * @param ownFields   fields on the listed collection itself (e.g. ['invoiceNo'])
 * @param refs        which referenced records to resolve: { patient, doctor }
 */
export async function buildSearchFilter(search, ownFields = [], refs = {}) {
  const term = String(search || '').trim();
  if (!term) return {};

  const rx = new RegExp(escapeRegex(term), 'i');
  const or = ownFields.map((field) => ({ [field]: rx }));

  const [patientIds, doctorIds] = await Promise.all([
    refs.patient ? matchingPatientIds(term) : Promise.resolve(null),
    refs.doctor ? matchingDoctorIds(term) : Promise.resolve(null),
  ]);

  if (patientIds?.length) or.push({ [refs.patient === true ? 'patient' : refs.patient]: { $in: patientIds } });
  if (doctorIds?.length) or.push({ [refs.doctor === true ? 'doctor' : refs.doctor]: { $in: doctorIds } });

  // Every branch came back empty — match nothing, rather than dropping the
  // clause and silently returning the unfiltered list.
  if (!or.length) return { _id: null };

  return { $or: or };
}
