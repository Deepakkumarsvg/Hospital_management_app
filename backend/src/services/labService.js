import { LabTest } from '../models/LabTest.js';
import { LabOrder, LAB_TRANSITIONS } from '../models/LabOrder.js';
import { Patient } from '../models/Patient.js';
import { Doctor } from '../models/Doctor.js';
import { ApiError } from '../utils/ApiError.js';

// ---------- Test master ----------
export async function listTests({ search, category, status } = {}) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (category) filter.category = category;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { code: rx }, { category: rx }];
  }
  return LabTest.find(filter).sort({ category: 1, name: 1 });
}
export const activeTests = () => LabTest.find({ status: 'ACTIVE' }).sort({ name: 1 });
export const createTest = (data) => LabTest.create(data);
export async function updateTest(id, data) {
  const t = await LabTest.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!t) throw ApiError.notFound('Test not found', 'LAB_TEST_NOT_FOUND');
  return t;
}
export async function deleteTest(id) {
  const t = await LabTest.findById(id);
  if (!t) throw ApiError.notFound('Test not found', 'LAB_TEST_NOT_FOUND');

  const orderCount = await LabOrder.countDocuments({ 'items.test': id });
  if (orderCount) {
    throw ApiError.conflict(
      'This test has been ordered before and cannot be deleted. Set its status to Inactive instead.',
      'LAB_TEST_HAS_HISTORY',
      { orders: orderCount }
    );
  }

  await LabTest.findByIdAndDelete(id);
  return t;
}

// ---------- Orders ----------
const POPULATE = [
  { path: 'patient', select: 'uhid firstName lastName gender dateOfBirth' },
  { path: 'doctor', select: 'firstName lastName specialization user' },
  { path: 'verifiedBy', select: 'name' },
  { path: 'opdVisit', select: 'visitNo' },
];

// Order number is searchable directly, but patient/doctor are refs — resolve
// matching ids first so a name/UHID search actually finds orders.
async function searchFilter(search) {
  if (!search) return {};
  const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const [patients, doctors] = await Promise.all([
    Patient.find({ $or: [{ firstName: rx }, { lastName: rx }, { uhid: rx }] }).select('_id'),
    Doctor.find({ $or: [{ firstName: rx }, { lastName: rx }] }).select('_id'),
  ]);
  return {
    $or: [
      { orderNo: rx },
      { patient: { $in: patients.map((p) => p._id) } },
      { doctor: { $in: doctors.map((d) => d._id) } },
    ],
  };
}

export async function listOrders({ page, limit, search, status, patient, doctor }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (patient) filter.patient = patient;
  if (doctor) filter.doctor = doctor;
  Object.assign(filter, await searchFilter(search));

  const [items, total] = await Promise.all([
    LabOrder.find(filter).populate(POPULATE).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    LabOrder.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function getOrder(id) {
  const order = await LabOrder.findById(id).populate(POPULATE);
  if (!order) throw ApiError.notFound('Lab order not found', 'LAB_ORDER_NOT_FOUND');
  return order;
}

export async function createOrder(data, userId) {
  const patient = await Patient.findById(data.patient).select('_id');
  if (!patient) throw ApiError.badRequest('Patient does not exist', 'PATIENT_NOT_FOUND');

  const items = [];
  // Catalogue tests → snapshot their details onto the order.
  if (data.tests?.length) {
    const tests = await LabTest.find({ _id: { $in: data.tests } });
    for (const t of tests) {
      items.push({ test: t._id, name: t.name, unit: t.unit, referenceRange: t.referenceRange, price: t.price });
    }
  }
  // Ad-hoc items.
  for (const it of data.items || []) items.push({ ...it });
  if (!items.length) throw ApiError.badRequest('Add at least one test', 'NO_TESTS');

  const order = new LabOrder({
    patient: data.patient, doctor: data.doctor || null, opdVisit: data.opdVisit || null,
    notes: data.notes || '', items, createdBy: userId,
  });
  await order.save();
  return order.populate(POPULATE);
}

export async function changeStatus(id, next, userId) {
  const order = await LabOrder.findById(id);
  if (!order) throw ApiError.notFound('Lab order not found', 'LAB_ORDER_NOT_FOUND');
  const allowed = LAB_TRANSITIONS[order.status] || [];
  if (!allowed.includes(next)) {
    throw ApiError.badRequest(`Cannot change status from ${order.status} to ${next}`, 'INVALID_STATUS_TRANSITION');
  }
  order.status = next;
  if (next === 'SAMPLE_COLLECTED') order.sampleCollectedAt = new Date();
  if (next === 'VERIFIED') { order.verifiedAt = new Date(); order.verifiedBy = userId; }
  await order.save();
  return order.populate(POPULATE);
}

export async function enterResults(id, items) {
  const order = await LabOrder.findById(id);
  if (!order) throw ApiError.notFound('Lab order not found', 'LAB_ORDER_NOT_FOUND');
  if (!['SAMPLE_COLLECTED', 'PROCESSING', 'COMPLETED'].includes(order.status)) {
    throw ApiError.badRequest('Collect the sample before entering results', 'LAB_NOT_READY');
  }
  order.items = items.map((it) => ({
    name: it.name, unit: it.unit || '', referenceRange: it.referenceRange || '',
    result: it.result || '', flag: it.flag || 'NORMAL', price: it.price || 0,
  }));
  order.resultEnteredAt = new Date();
  order.status = 'COMPLETED';
  await order.save();
  return order.populate(POPULATE);
}

// Flat rows for CSV/XLSX export.
export async function labOrderRowsForExport({ search, status, patient, doctor }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (patient) filter.patient = patient;
  if (doctor) filter.doctor = doctor;
  Object.assign(filter, await searchFilter(search));

  const items = await LabOrder.find(filter).populate(POPULATE).sort({ createdAt: -1 });

  return items.map((o) => ({
    'Order No': o.orderNo,
    Patient: o.patient ? `${o.patient.firstName} ${o.patient.lastName || ''}`.trim() : '',
    'Patient UHID': o.patient?.uhid || '',
    Doctor: o.doctor ? `${o.doctor.firstName} ${o.doctor.lastName || ''}`.trim() : '',
    Tests: (o.items || []).map((i) => i.name).join(', '),
    'Total Price': o.totalPrice,
    Status: o.status,
    'Ordered On': o.createdAt ? o.createdAt.toISOString().slice(0, 10) : '',
    'Verified On': o.verifiedAt ? o.verifiedAt.toISOString().slice(0, 10) : '',
  }));
}

export async function labStats() {
  const [total, pending, verified] = await Promise.all([
    LabOrder.countDocuments({}),
    LabOrder.countDocuments({ status: { $in: ['ORDERED', 'SAMPLE_COLLECTED', 'PROCESSING'] } }),
    LabOrder.countDocuments({ status: 'VERIFIED' }),
  ]);
  return { total, pending, verified };
}
