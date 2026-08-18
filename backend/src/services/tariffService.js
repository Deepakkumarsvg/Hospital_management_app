// Resolving what a given patient is actually charged for a given service.
//
// The rule, in order:
//   1. the plan's own negotiated rate for that exact service, if it has one;
//   2. otherwise the catalogue price, adjusted by the plan's blanket
//      percentage;
//   3. otherwise the catalogue price as-is.
//
// Step 2 is what makes this usable. Nearly every contract is "your standard
// list, minus 10%" with a handful of specifically negotiated lines; requiring
// every service to be priced explicitly would mean hundreds of rows per plan
// that nobody keeps current, and stale rates are worse than no rates.
import { TariffPlan, TariffRate } from '../models/TariffPlan.js';
import { Patient } from '../models/Patient.js';
import { ApiError } from '../utils/ApiError.js';

// ---- Plans -------------------------------------------------------------------

export const listPlans = ({ status } = {}) =>
  TariffPlan.find(status && status !== 'ALL' ? { status } : {}).sort({ isDefault: -1, name: 1 });

export const activePlans = () => TariffPlan.find({ status: 'ACTIVE' }).sort({ isDefault: -1, name: 1 });

export async function getPlan(id) {
  const plan = await TariffPlan.findById(id);
  if (!plan) throw ApiError.notFound('Tariff plan not found', 'TARIFF_PLAN_NOT_FOUND');
  return plan;
}

export async function createPlan(data) {
  const plan = await TariffPlan.create({ ...data, isDefault: false });
  // Setting the flag goes through the same guarded path as changing it later,
  // so "exactly one default" holds from the first plan onwards.
  if (data.isDefault) await setDefaultPlan(plan._id);
  return TariffPlan.findById(plan._id);
}

export async function updatePlan(id, data) {
  const { isDefault, ...rest } = data;
  const plan = await TariffPlan.findByIdAndUpdate(id, rest, { new: true, runValidators: true });
  if (!plan) throw ApiError.notFound('Tariff plan not found', 'TARIFF_PLAN_NOT_FOUND');
  if (isDefault === true) return setDefaultPlan(id);
  return plan;
}

// Exactly one plan is the default. Clearing every other flag first — rather
// than trusting callers to do it — is what stops two plans both claiming it and
// leaving which one applies down to query order.
export async function setDefaultPlan(id) {
  const plan = await TariffPlan.findById(id);
  if (!plan) throw ApiError.notFound('Tariff plan not found', 'TARIFF_PLAN_NOT_FOUND');
  if (plan.status !== 'ACTIVE') {
    throw ApiError.badRequest('An inactive plan cannot be the default', 'TARIFF_PLAN_INACTIVE');
  }

  await TariffPlan.updateMany({ _id: { $ne: id } }, { $set: { isDefault: false } });
  return TariffPlan.findByIdAndUpdate(id, { $set: { isDefault: true } }, { new: true });
}

export async function deletePlan(id) {
  const plan = await getPlan(id);
  if (plan.isDefault) {
    throw ApiError.badRequest(
      'This is the default plan. Make another plan the default before deleting it.',
      'TARIFF_PLAN_IS_DEFAULT'
    );
  }

  // A plan somebody is on cannot vanish underneath them — their next bill would
  // silently fall back to list price.
  const inUse = await Patient.countDocuments({ tariffPlan: id });
  if (inUse) {
    throw ApiError.conflict(
      `${inUse} patient(s) are on this plan. Move them to another plan, or set this one to Inactive instead.`,
      'TARIFF_PLAN_IN_USE',
      { patients: inUse }
    );
  }

  await TariffRate.deleteMany({ plan: id });
  await TariffPlan.findByIdAndDelete(id);
  return plan;
}

// ---- Rates -------------------------------------------------------------------

export const listRates = (planId, serviceType) =>
  TariffRate.find({ plan: planId, ...(serviceType ? { serviceType } : {}) }).sort({ serviceType: 1 });

// Set (or clear) one negotiated rate.
//
// A null price REMOVES the override rather than storing zero — "this plan does
// not price this specially" and "this plan prices this at nothing" are
// different statements, and conflating them would make every removed rate a
// free service.
export async function setRate(planId, { serviceType, service, price }) {
  await getPlan(planId); // 404s on an unknown plan

  if (price === null || price === undefined) {
    await TariffRate.deleteOne({ plan: planId, serviceType, service });
    return null;
  }

  return TariffRate.findOneAndUpdate(
    { plan: planId, serviceType, service },
    { $set: { price } },
    { upsert: true, new: true, runValidators: true }
  );
}

// Replace a plan's rates for one service type in one go — the "import a price
// list" case, which is how these are actually maintained.
export async function setRatesBulk(planId, serviceType, rows = []) {
  await getPlan(planId);

  const ops = rows
    .filter((r) => r.service)
    .map((r) => ({
      updateOne: {
        filter: { plan: planId, serviceType, service: r.service },
        update: { $set: { price: r.price } },
        upsert: true,
      },
    }));

  if (!ops.length) return { updated: 0 };
  const res = await TariffRate.bulkWrite(ops);
  return { updated: (res.upsertedCount || 0) + (res.modifiedCount || 0) };
}

// ---- Price resolution --------------------------------------------------------

// The plan a patient is billed under: their own, or the house default.
export async function planForPatient(patientId) {
  const patient = await Patient.findById(patientId).select('tariffPlan').lean();
  if (patient?.tariffPlan) {
    const own = await TariffPlan.findOne({ _id: patient.tariffPlan, status: 'ACTIVE' }).lean();
    // A patient on a plan that has since been deactivated falls back to the
    // default rather than to list price — the contract lapsing is an
    // administrative event, not a reason to charge them differently today.
    if (own) return own;
  }
  return TariffPlan.findOne({ isDefault: true, status: 'ACTIVE' }).lean();
}

const applyAdjustment = (price, percent) =>
  (percent ? Math.max(0, Math.round(price * (1 + percent / 100))) : price);

/**
 * A priced lookup for many services at once.
 *
 * Returns a function `(serviceType, serviceId, catalogPrice) => price`, so a
 * caller pricing a whole bill does one query rather than one per line.
 */
export async function priceResolver(patientId) {
  const plan = await planForPatient(patientId);
  if (!plan) return (_type, _id, catalogPrice) => catalogPrice;

  const rates = await TariffRate.find({ plan: plan._id }).lean();
  const overrides = new Map(rates.map((r) => [`${r.serviceType}:${r.service}`, r.price]));

  const resolve = (serviceType, serviceId, catalogPrice = 0) => {
    const override = overrides.get(`${serviceType}:${serviceId}`);
    if (override !== undefined) return override;
    return applyAdjustment(catalogPrice, plan.baseAdjustmentPercent);
  };
  resolve.plan = plan;
  return resolve;
}

// Single-service version, for the odd caller that only needs one price.
export async function priceFor(patientId, serviceType, serviceId, catalogPrice = 0) {
  const resolve = await priceResolver(patientId);
  return resolve(serviceType, serviceId, catalogPrice);
}
