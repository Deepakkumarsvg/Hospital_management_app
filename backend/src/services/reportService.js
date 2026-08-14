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

export async function getSummary({ from, to }) {
  // Build an inclusive [from, to] range if provided.
  let range;
  if (from || to) {
    range = {};
    if (from) { const d = new Date(from); d.setHours(0, 0, 0, 0); range.$gte = d; }
    if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); range.$lte = d; }
  }
  const createdRange = range ? { createdAt: range } : {};

  const [
    patients, opdVisits, ipdAdmissions, labOrders, radOrders,
    apptByStatus, opdByStatus, labByStatus, radByStatus,
    currentAdmissions, beds, activeDoctors,
    revenueAgg, revenueByCategory, revenueTrend,
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
  ]);

  const bedCounts = beds.reduce((acc, b) => ({ ...acc, [b._id]: b.count }), {});
  const totalBeds = beds.reduce((s, b) => s + b.count, 0);
  const rev = revenueAgg[0] || { billed: 0, collected: 0, due: 0, count: 0 };

  return {
    range: { from: from || null, to: to || null },
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
    revenue: {
      billed: Math.round(rev.billed || 0),
      collected: Math.round(rev.collected || 0),
      due: Math.round(rev.due || 0),
      invoices: rev.count || 0,
      byCategory: revenueByCategory.map((r) => ({ category: r._id || 'OTHER', amount: Math.round(r.amount) })),
      trend: revenueTrend.map((r) => ({ date: r._id, amount: Math.round(r.amount) })),
    },
    breakdowns: {
      appointments: apptByStatus,
      opd: opdByStatus,
      lab: labByStatus,
      radiology: radByStatus,
    },
  };
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

// Rows for an invoice export.
export async function invoiceRows({ from, to } = {}) {
  const range = buildRange({ from, to });
  const filter = range ? { createdAt: range } : {};
  const invoices = await Invoice.find(filter).populate({ path: 'patient', select: 'uhid firstName lastName' }).sort({ createdAt: -1 }).lean();
  return invoices.map((i) => ({
    invoiceNo: i.invoiceNo,
    date: new Date(i.createdAt).toISOString().slice(0, 10),
    uhid: i.patient?.uhid || '',
    patient: [i.patient?.firstName, i.patient?.lastName].filter(Boolean).join(' '),
    subtotal: i.subtotal, discount: i.discount, tax: i.tax,
    grandTotal: i.grandTotal, paid: i.paidAmount, due: i.dueAmount, status: i.status,
  }));
}
