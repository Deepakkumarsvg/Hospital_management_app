import { Patient } from '../models/Patient.js';
import { Appointment } from '../models/Appointment.js';
import { OPDVisit } from '../models/OPDVisit.js';
import { IPDAdmission } from '../models/IPDAdmission.js';
import { LabOrder } from '../models/LabOrder.js';
import { RadiologyOrder } from '../models/RadiologyOrder.js';
import { Bed } from '../models/Bed.js';
import { Doctor } from '../models/Doctor.js';
import { Invoice } from '../models/Invoice.js';
import { Payment } from '../models/Payment.js';
import { Medicine } from '../models/Medicine.js';
import { MedicineDispense } from '../models/MedicineDispense.js';
import { InventoryItem } from '../models/InventoryItem.js';
import { PurchaseOrder } from '../models/PurchaseOrder.js';
import { Ambulance } from '../models/Ambulance.js';
import { AmbulanceTrip } from '../models/AmbulanceTrip.js';
import { Employee } from '../models/Employee.js';
import { Leave } from '../models/Leave.js';
import { Payslip } from '../models/Payslip.js';
import { BloodUnit } from '../models/BloodUnit.js';
import { toRupees } from '../utils/money.js';

// Group a collection by status within a date range on a given field.
async function statusBreakdown(Model, dateField, range) {
  const match = range ? { [dateField]: range } : {};
  const rows = await Model.aggregate([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  return rows.map((r) => ({ status: r._id, count: r.count }));
}

// Core counts used both for the live period and, shifted back, for the
// "vs previous period" comparison — kept minimal (just what the trend
// indicators show) rather than re-running the whole summary twice.
async function coreCounts(range) {
  const createdRange = range ? { createdAt: range } : {};
  const [patients, opdVisits, ipdAdmissions, labOrders, radOrders, collectedAgg] = await Promise.all([
    Patient.countDocuments(createdRange),
    OPDVisit.countDocuments(range ? { visitDate: range } : {}),
    IPDAdmission.countDocuments(range ? { admissionDate: range } : {}),
    LabOrder.countDocuments(createdRange),
    RadiologyOrder.countDocuments(createdRange),
    Payment.aggregate([{ $match: createdRange }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
  ]);
  // Payment.amount is stored in paise; aggregation results bypass the schema's
  // toJSON, so the conversion back to rupees happens here. See utils/money.js.
  return { patients, opdVisits, ipdAdmissions, labOrders, radOrders, collected: toRupees(collectedAgg[0]?.total || 0) };
}

function pctChange(curr, prev) {
  if (!prev) return curr ? null : 0; // no prior baseline to compare against
  return Math.round(((curr - prev) / prev) * 100);
}

export async function getSummary({ from, to }) {
  // Build an inclusive [from, to] range if provided.
  let range;
  if (from || to) {
    range = {};
    if (from) { const d = new Date(from); d.setHours(0, 0, 0, 0); range.$gte = d; }
    if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); range.$lte = d; }
  }
  const createdRange = range ? { createdAt: range } : {};

  // Previous period of equal length, immediately before `from` — only
  // meaningful when the user picked an actual range (an "all time" query
  // has no natural prior period to compare against).
  let deltas = null;
  if (range?.$gte && range?.$lte) {
    const lengthMs = range.$lte.getTime() - range.$gte.getTime();
    const prevTo = new Date(range.$gte.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - lengthMs);
    const [curr, prev] = await Promise.all([coreCounts(range), coreCounts({ $gte: prevFrom, $lte: prevTo })]);
    deltas = {
      patients: pctChange(curr.patients, prev.patients),
      opdVisits: pctChange(curr.opdVisits, prev.opdVisits),
      ipdAdmissions: pctChange(curr.ipdAdmissions, prev.ipdAdmissions),
      labOrders: pctChange(curr.labOrders, prev.labOrders),
      radOrders: pctChange(curr.radOrders, prev.radOrders),
      collected: pctChange(curr.collected, prev.collected),
    };
  }

  const [
    patients, opdVisits, ipdAdmissions, labOrders, radOrders,
    apptByStatus, opdByStatus, labByStatus, radByStatus, ipdByStatus,
    currentAdmissions, beds, activeDoctors,
    revenueAgg, revenueByCategory, revenueTrend,
    activeMedicines, lowStockMedicines, dispenseAgg,
    lowStockItems, openPOs,
    totalAmbulances, ongoingTrips, tripsAgg,
    activeStaff, pendingLeaves, payrollAgg,
  ] = await Promise.all([
    Patient.countDocuments(createdRange),
    OPDVisit.countDocuments(range ? { visitDate: range } : {}),
    IPDAdmission.countDocuments(range ? { admissionDate: range } : {}),
    LabOrder.countDocuments(createdRange),
    RadiologyOrder.countDocuments(createdRange),
    statusBreakdown(Appointment, 'date', range),
    statusBreakdown(OPDVisit, 'visitDate', range),
    statusBreakdown(LabOrder, 'createdAt', range),
    statusBreakdown(RadiologyOrder, 'createdAt', range),
    statusBreakdown(IPDAdmission, 'admissionDate', range),
    IPDAdmission.countDocuments({ status: 'ADMITTED' }),
    Bed.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Doctor.countDocuments({ status: 'ACTIVE' }),
    // Billed / collected / due totals across invoices in range.
    Invoice.aggregate([
      { $match: { ...createdRange, status: { $ne: 'CANCELLED' } } },
      { $group: {
        _id: null,
        billed: { $sum: '$grandTotal' },
        collected: { $sum: '$paidAmount' },
        due: { $sum: '$dueAmount' },
        count: { $sum: 1 },
      } },
    ]),
    // Revenue split by invoice line-item category.
    Invoice.aggregate([
      { $match: { ...createdRange, status: { $ne: 'CANCELLED' } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.category', amount: { $sum: '$items.amount' } } },
      { $sort: { amount: -1 } },
    ]),
    // Daily collection trend (payments) for the range, or last 30 days.
    Payment.aggregate([
      { $match: range ? { createdAt: range } : { createdAt: { $gte: new Date(Date.now() - 30 * 864e5) } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        amount: { $sum: '$amount' },
      } },
      { $sort: { _id: 1 } },
    ]),
    // Pharmacy
    Medicine.countDocuments({ status: 'ACTIVE' }),
    Medicine.countDocuments({ $expr: { $lte: ['$currentStock', '$minStock'] }, status: 'ACTIVE' }),
    MedicineDispense.aggregate([
      { $match: createdRange },
      { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$total' } } },
    ]),
    // Inventory
    InventoryItem.countDocuments({ $expr: { $lte: ['$currentStock', '$minStock'] }, status: 'ACTIVE' }),
    PurchaseOrder.countDocuments({ status: { $in: ['ORDERED', 'PARTIALLY_RECEIVED'] } }),
    // Ambulance
    Ambulance.countDocuments({}),
    AmbulanceTrip.countDocuments({ status: 'ONGOING' }),
    AmbulanceTrip.aggregate([
      { $match: createdRange },
      { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$charges' } } },
    ]),
    // HR / payroll
    Employee.countDocuments({ status: 'ACTIVE' }),
    Leave.countDocuments({ status: 'PENDING' }),
    Payslip.aggregate([
      { $match: createdRange },
      { $group: { _id: null, count: { $sum: 1 }, net: { $sum: '$netPay' }, paid: { $sum: { $cond: [{ $eq: ['$status', 'PAID'] }, '$netPay', 0] } } } },
    ]),
  ]);

  const bedCounts = beds.reduce((acc, b) => ({ ...acc, [b._id]: b.count }), {});
  const totalBeds = beds.reduce((s, b) => s + b.count, 0);
  const rev = revenueAgg[0] || { billed: 0, collected: 0, due: 0, count: 0 };
  const dispenses = dispenseAgg[0] || { count: 0, revenue: 0 };
  const trips = tripsAgg[0] || { count: 0, revenue: 0 };
  const payroll = payrollAgg[0] || { count: 0, net: 0, paid: 0 };

  return {
    range: { from: from || null, to: to || null },
    deltas,
    totals: {
      patients, opdVisits, ipdAdmissions, labOrders, radOrders,
      currentAdmissions, activeDoctors,
    },
    beds: {
      total: totalBeds,
      available: bedCounts.AVAILABLE || 0,
      occupied: bedCounts.OCCUPIED || 0,
      reserved: bedCounts.RESERVED || 0,
      maintenance: bedCounts.MAINTENANCE || 0,
      occupancyRate: totalBeds ? Math.round(((bedCounts.OCCUPIED || 0) / totalBeds) * 100) : 0,
    },
    // Invoice and Payment amounts come out of aggregation in paise, which
    // bypasses the schema's toJSON — they are converted back to rupees here.
    // Pharmacy and ambulance figures are not stored in paise, so they aren't.
    revenue: {
      billed: toRupees(rev.billed || 0),
      collected: toRupees(rev.collected || 0),
      due: toRupees(rev.due || 0),
      invoices: rev.count || 0,
      byCategory: revenueByCategory.map((r) => ({ category: r._id || 'OTHER', amount: toRupees(r.amount) })),
      trend: revenueTrend.map((r) => ({ date: r._id, amount: toRupees(r.amount) })),
    },
    pharmacy: {
      activeMedicines, lowStock: lowStockMedicines,
      dispenses: dispenses.count, dispenseRevenue: Math.round(dispenses.revenue || 0),
    },
    inventory: { lowStock: lowStockItems, openPOs },
    ambulance: {
      total: totalAmbulances, ongoing: ongoingTrips,
      trips: trips.count, tripRevenue: Math.round(trips.revenue || 0),
    },
    hr: {
      activeStaff, pendingLeaves,
      payslips: payroll.count,
      payrollCost: toRupees(payroll.net || 0),
      payrollPaid: toRupees(payroll.paid || 0),
    },
    breakdowns: {
      appointments: apptByStatus,
      opd: opdByStatus,
      ipd: ipdByStatus,
      lab: labByStatus,
      radiology: radByStatus,
    },
  };
}

// Everything the dashboard needs, in one round trip.
//
// The dashboard used to make eleven parallel calls — one per module's stats
// endpoint plus the full report summary — and silently drop whichever ones the
// caller's role could not reach. That meant eleven authentications, eleven
// tenant resolutions and a fan-out of dozens of queries for a single page load.
//
// Sections are still permission-gated individually, so the graceful degradation
// is preserved exactly: a pharmacist gets the pharmacy section and nothing they
// have no business seeing. A section the caller cannot see is simply absent,
// which is what the client already knew how to render.
export async function dashboardSummary({ permissions, isSuperAdmin = false } = {}) {
  const granted = permissions instanceof Set ? permissions : new Set(permissions || []);
  const can = (key) => isSuperAdmin || granted.has(key);

  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay); endOfDay.setDate(endOfDay.getDate() + 1);
  const today = { $gte: startOfDay, $lt: endOfDay };

  // Only the sections this caller may see are queried at all — an unauthorised
  // section costs nothing rather than being fetched and thrown away.
  const jobs = {};

  if (can('patients:view')) jobs.patients = Patient.countDocuments({}).then((total) => ({ total }));

  if (can('appointments:view')) {
    jobs.appointments = Promise.all([
      Appointment.countDocuments({}),
      Appointment.countDocuments({ date: today }),
      Appointment.find({ date: today })
        .populate([{ path: 'patient', select: 'uhid firstName lastName' }, { path: 'doctor', select: 'firstName lastName' }])
        .sort({ time: 1 }).limit(6).lean(),
      Appointment.aggregate([{ $match: { date: today } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]).then(([total, todayCount, upcoming, byStatus]) => ({
      total, today: todayCount, upcoming,
      breakdown: byStatus.map((r) => ({ status: r._id, count: r.count })),
    }));
  }

  if (can('doctors:view')) jobs.doctors = Doctor.countDocuments({ status: 'ACTIVE' }).then((active) => ({ active }));
  if (can('opd:view')) jobs.opd = OPDVisit.countDocuments({ visitDate: today }).then((t) => ({ today: t }));
  if (can('ipd:view')) jobs.ipd = IPDAdmission.countDocuments({ status: 'ADMITTED' }).then((c) => ({ current: c }));

  if (can('laboratory:view')) {
    jobs.lab = LabOrder.countDocuments({ status: { $in: ['ORDERED', 'SAMPLE_COLLECTED', 'PROCESSING'] } })
      .then((pending) => ({ pending }));
  }

  if (can('pharmacy:view')) {
    jobs.pharmacy = Medicine.countDocuments({ $expr: { $lte: ['$currentStock', '$minStock'] }, status: 'ACTIVE' })
      .then((lowStock) => ({ lowStock }));
  }

  if (can('facilities:view')) {
    jobs.beds = Bed.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).then((rows) => {
      const by = rows.reduce((a, r) => ({ ...a, [r._id]: r.count }), {});
      const total = rows.reduce((s, r) => s + r.count, 0);
      return {
        total,
        available: by.AVAILABLE || 0,
        occupied: by.OCCUPIED || 0,
        reserved: by.RESERVED || 0,
        maintenance: by.MAINTENANCE || 0,
        occupancyRate: total ? Math.round(((by.OCCUPIED || 0) / total) * 100) : 0,
      };
    });
  }

  if (can('billing:view')) {
    jobs.billing = Promise.all([
      Invoice.aggregate([
        { $match: { status: { $ne: 'CANCELLED' } } },
        { $group: { _id: null, billed: { $sum: '$grandTotal' }, collected: { $sum: '$paidAmount' }, due: { $sum: '$dueAmount' } } },
      ]),
      Payment.aggregate([
        { $match: { createdAt: { $gte: new Date(Date.now() - 30 * 864e5) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, amount: { $sum: '$amount' } } },
        { $sort: { _id: 1 } },
      ]),
    ]).then(([agg, trend]) => {
      const a = agg[0] || { billed: 0, collected: 0, due: 0 };
      // Stored as paise; aggregation bypasses toJSON. See utils/money.js.
      return {
        billed: toRupees(a.billed), collected: toRupees(a.collected), due: toRupees(a.due),
        trend: trend.map((r) => ({ date: r._id, amount: toRupees(r.amount) })),
      };
    });
  }

  if (can('bloodbank:view')) {
    const now = new Date();
    jobs.blood = BloodUnit.countDocuments({
      status: 'AVAILABLE',
      expiryDate: { $gt: now, $lte: new Date(now.getTime() + 7 * 864e5) },
    }).then((expiringSoon) => ({ expiringSoon }));
  }

  const keys = Object.keys(jobs);
  const values = await Promise.all(keys.map((k) => jobs[k].catch(() => null)));
  return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
}

// Build an inclusive [from,to] range object once.
function buildRange({ from, to }) {
  if (!from && !to) return null;
  const range = {};
  if (from) { const d = new Date(from); d.setHours(0, 0, 0, 0); range.$gte = d; }
  if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); range.$lte = d; }
  return range;
}

// Doctor-wise activity: appointments, completed appts, OPD visits.
export async function doctorActivity({ from, to } = {}) {
  const range = buildRange({ from, to });
  const apptMatch = range ? { date: range } : {};
  const opdMatch = range ? { visitDate: range } : {};

  const [appts, completed, visits, doctors] = await Promise.all([
    Appointment.aggregate([{ $match: apptMatch }, { $group: { _id: '$doctor', c: { $sum: 1 } } }]),
    Appointment.aggregate([{ $match: { ...apptMatch, status: 'COMPLETED' } }, { $group: { _id: '$doctor', c: { $sum: 1 } } }]),
    OPDVisit.aggregate([{ $match: opdMatch }, { $group: { _id: '$doctor', c: { $sum: 1 } } }]),
    Doctor.find({}).select('firstName lastName specialization consultationFee').lean(),
  ]);
  const map = (arr) => arr.reduce((a, r) => ({ ...a, [String(r._id)]: r.c }), {});
  const A = map(appts); const C = map(completed); const V = map(visits);

  return doctors
    .map((d) => {
      const id = String(d._id);
      const opdVisits = V[id] || 0;
      return {
        doctor: `Dr. ${[d.firstName, d.lastName].filter(Boolean).join(' ')}`,
        specialization: d.specialization,
        appointments: A[id] || 0,
        completed: C[id] || 0,
        opdVisits,
        estConsultRevenue: Math.round(opdVisits * (d.consultationFee || 0)),
      };
    })
    .filter((r) => r.appointments || r.opdVisits)
    .sort((a, b) => b.opdVisits - a.opdVisits);
}

// Flat key/value rows for a full-summary export.
export async function summaryRows({ from, to } = {}) {
  const s = await getSummary({ from, to });
  const rows = [];
  const push = (metric, value) => rows.push({ Metric: metric, Value: value });

  Object.entries(s.totals).forEach(([k, v]) => push(k, v));
  Object.entries(s.beds).forEach(([k, v]) => push(`beds_${k}`, v));
  Object.entries(s.revenue).forEach(([k, v]) => { if (typeof v !== 'object') push(`revenue_${k}`, v); });
  Object.entries(s.pharmacy).forEach(([k, v]) => push(`pharmacy_${k}`, v));
  Object.entries(s.inventory).forEach(([k, v]) => push(`inventory_${k}`, v));
  Object.entries(s.ambulance).forEach(([k, v]) => push(`ambulance_${k}`, v));
  Object.entries(s.hr).forEach(([k, v]) => push(`hr_${k}`, v));
  for (const [group, breakdown] of Object.entries(s.breakdowns)) {
    breakdown.forEach((r) => push(`${group}_${r.status}`, r.count));
  }
  return rows;
}

// Rows for an invoice export.
export async function invoiceRows({ from, to } = {}) {
  const range = buildRange({ from, to });
  const filter = range ? { createdAt: range } : {};
  // .lean() skips the schema's toJSON, so the stored paise arrive raw and are
  // converted here — an export of 100x every figure would be worse than no
  // export at all. See utils/money.js.
  const invoices = await Invoice.find(filter).populate({ path: 'patient', select: 'uhid firstName lastName' }).sort({ createdAt: -1 }).lean();
  return invoices.map((i) => ({
    invoiceNo: i.invoiceNo,
    date: new Date(i.createdAt).toISOString().slice(0, 10),
    uhid: i.patient?.uhid || '',
    patient: [i.patient?.firstName, i.patient?.lastName].filter(Boolean).join(' '),
    subtotal: toRupees(i.subtotal), discount: toRupees(i.discount), tax: toRupees(i.tax),
    grandTotal: toRupees(i.grandTotal), paid: toRupees(i.paidAmount), due: toRupees(i.dueAmount),
    status: i.status,
  }));
}
