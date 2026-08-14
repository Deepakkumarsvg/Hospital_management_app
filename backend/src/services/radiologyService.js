import { RadiologyTest } from '../models/RadiologyTest.js';
import { RadiologyOrder, RAD_TRANSITIONS } from '../models/RadiologyOrder.js';
import { Patient } from '../models/Patient.js';
import { ApiError } from '../utils/ApiError.js';

// ---------- Test master ----------
export async function listTests({ search, modality, status } = {}) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (modality) filter.modality = modality;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { code: rx }];
  }
  return RadiologyTest.find(filter).sort({ modality: 1, name: 1 });
}
export const activeTests = () => RadiologyTest.find({ status: 'ACTIVE' }).sort({ name: 1 });
export const createTest = (data) => RadiologyTest.create(data);
export async function updateTest(id, data) {
  const t = await RadiologyTest.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!t) throw ApiError.notFound('Test not found', 'RAD_TEST_NOT_FOUND');
  return t;
}
export async function deleteTest(id) {
  const t = await RadiologyTest.findByIdAndDelete(id);
  if (!t) throw ApiError.notFound('Test not found', 'RAD_TEST_NOT_FOUND');
  return t;
}

// ---------- Orders ----------
const POPULATE = [
  { path: 'patient', select: 'uhid firstName lastName gender dateOfBirth' },
  { path: 'doctor', select: 'firstName lastName specialization' },
  { path: 'reportedBy', select: 'name' },
];

export async function listOrders({ page, limit, search, status, patient }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (patient) filter.patient = patient;
  if (search) filter.orderNo = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  const [items, total] = await Promise.all([
    RadiologyOrder.find(filter).populate(POPULATE).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    RadiologyOrder.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function getOrder(id) {
  const order = await RadiologyOrder.findById(id).populate(POPULATE);
  if (!order) throw ApiError.notFound('Radiology order not found', 'RAD_ORDER_NOT_FOUND');
  return order;
}

export async function createOrder(data, userId) {
  const patient = await Patient.findById(data.patient).select('_id');
  if (!patient) throw ApiError.badRequest('Patient does not exist', 'PATIENT_NOT_FOUND');

  let testName = data.testName;
  let modality = data.modality;
  let price = 0;
  if (data.test) {
    const t = await RadiologyTest.findById(data.test);
    if (!t) throw ApiError.badRequest('Test does not exist', 'RAD_TEST_NOT_FOUND');
    testName = t.name; modality = t.modality; price = t.price;
  }
  if (!testName) throw ApiError.badRequest('Test name is required', 'NO_TEST');

  const order = new RadiologyOrder({
    patient: data.patient, doctor: data.doctor || null, test: data.test || null,
    testName, modality: modality || 'XRAY', price, notes: data.notes || '', createdBy: userId,
  });
  await order.save();
  return order.populate(POPULATE);
}

export async function changeStatus(id, next, scheduledAt) {
  const order = await RadiologyOrder.findById(id);
  if (!order) throw ApiError.notFound('Radiology order not found', 'RAD_ORDER_NOT_FOUND');
  const allowed = RAD_TRANSITIONS[order.status] || [];
  if (!allowed.includes(next)) {
    throw ApiError.badRequest(`Cannot change status from ${order.status} to ${next}`, 'INVALID_STATUS_TRANSITION');
  }
  order.status = next;
  if (next === 'SCHEDULED') order.scheduledAt = scheduledAt || new Date();
  await order.save();
  return order.populate(POPULATE);
}

export async function submitReport(id, { findings, impression }, userId) {
  const order = await RadiologyOrder.findById(id);
  if (!order) throw ApiError.notFound('Radiology order not found', 'RAD_ORDER_NOT_FOUND');
  if (!['COMPLETED', 'REPORTED'].includes(order.status)) {
    throw ApiError.badRequest('Mark the investigation completed before reporting', 'RAD_NOT_READY');
  }
  order.findings = findings || '';
  order.impression = impression || '';
  order.reportedAt = new Date();
  order.reportedBy = userId;
  order.status = 'REPORTED';
  await order.save();
  return order.populate(POPULATE);
}

export async function radStats() {
  const [total, pending, reported] = await Promise.all([
    RadiologyOrder.countDocuments({}),
    RadiologyOrder.countDocuments({ status: { $in: ['ORDERED', 'SCHEDULED', 'COMPLETED'] } }),
    RadiologyOrder.countDocuments({ status: 'REPORTED' }),
  ]);
  return { total, pending, reported };
}
