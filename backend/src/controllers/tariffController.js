import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/tariffService.js';
import { audit } from '../utils/audit.js';
import { toRupees } from '../utils/money.js';

export const list = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Tariff plans', data: await service.listPlans(req.query) }));

export const active = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Active tariff plans', data: await service.activePlans() }));

export const get = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Tariff plan', data: await service.getPlan(req.params.id) }));

export const create = asyncHandler(async (req, res) => {
  const plan = await service.createPlan(req.body);
  audit(req, {
    action: 'CREATE', module: 'TariffPlan', recordId: plan.code,
    description: `Tariff plan ${plan.name} (${plan.code}) created`,
  });
  sendSuccess(res, { statusCode: 201, message: 'Tariff plan created', data: plan });
});

export const update = asyncHandler(async (req, res) => {
  const plan = await service.updatePlan(req.params.id, req.body);
  audit(req, {
    action: 'UPDATE', module: 'TariffPlan', recordId: plan.code,
    description: `Tariff plan ${plan.name} updated`,
  });
  sendSuccess(res, { message: 'Tariff plan updated', data: plan });
});

export const makeDefault = asyncHandler(async (req, res) => {
  const plan = await service.setDefaultPlan(req.params.id);
  // Which plan is the default decides what every unassigned patient is charged,
  // so the change belongs on the trail with the plan named.
  audit(req, {
    action: 'UPDATE', module: 'TariffPlan', recordId: plan.code,
    description: `${plan.name} (${plan.code}) is now the default price list`,
  });
  sendSuccess(res, { message: 'Default plan updated', data: plan });
});

export const remove = asyncHandler(async (req, res) => {
  const plan = await service.deletePlan(req.params.id);
  audit(req, {
    action: 'DELETE', module: 'TariffPlan', recordId: plan.code,
    description: `Tariff plan ${plan.name} deleted`,
  });
  sendSuccess(res, { message: 'Tariff plan deleted', data: plan });
});

export const rates = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Rates', data: await service.listRates(req.params.id, req.query.serviceType) }));

export const setRate = asyncHandler(async (req, res) => {
  const rate = await service.setRate(req.params.id, req.body);
  audit(req, {
    action: 'UPDATE', module: 'TariffRate', recordId: req.params.id,
    description: rate
      ? `${req.body.serviceType} rate set to ₹${toRupees(rate.price)}`
      : `${req.body.serviceType} rate override removed`,
  });
  sendSuccess(res, { message: rate ? 'Rate saved' : 'Rate removed', data: rate });
});

export const setRatesBulk = asyncHandler(async (req, res) => {
  const result = await service.setRatesBulk(req.params.id, req.body.serviceType, req.body.rates);
  audit(req, {
    action: 'UPDATE', module: 'TariffRate', recordId: req.params.id,
    description: `${result.updated} ${req.body.serviceType} rate(s) imported`,
  });
  sendSuccess(res, { message: `${result.updated} rate(s) saved`, data: result });
});
