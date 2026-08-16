import { Ambulance } from '../models/Ambulance.js';
import { AmbulanceTrip, TRIP_STATUSES } from '../models/AmbulanceTrip.js';
import { Patient } from '../models/Patient.js';
import { ApiError } from '../utils/ApiError.js';
import { notify } from './notificationService.js';

export const listAmbulances = () => Ambulance.find().sort({ vehicleNo: 1 });
export const createAmbulance = (data) => Ambulance.create(data);
export async function updateAmbulance(id, data) {
  const a = await Ambulance.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!a) throw ApiError.notFound('Ambulance not found', 'AMBULANCE_NOT_FOUND');
  return a;
}
export async function deleteAmbulance(id) {
  const a = await Ambulance.findById(id);
  if (!a) throw ApiError.notFound('Ambulance not found', 'AMBULANCE_NOT_FOUND');

  if (a.status === 'ON_TRIP') {
    throw ApiError.conflict('This ambulance is currently on a trip and cannot be deleted.', 'AMBULANCE_ON_TRIP');
  }
  const tripCount = await AmbulanceTrip.countDocuments({ ambulance: id });
  if (tripCount) {
    throw ApiError.conflict(
      'This ambulance has trip history and cannot be deleted. Set its status to Maintenance instead.',
      'AMBULANCE_HAS_HISTORY',
      { trips: tripCount }
    );
  }

  await Ambulance.findByIdAndDelete(id);
  return a;
}

const TRIP_POPULATE = [{ path: 'ambulance', select: 'vehicleNo type' }, { path: 'patient', select: 'uhid firstName lastName' }];

async function tripSearchFilter(search) {
  if (!search) return {};
  const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const [ambulances, patients] = await Promise.all([
    Ambulance.find({ vehicleNo: rx }).select('_id'),
    Patient.find({ $or: [{ firstName: rx }, { lastName: rx }, { uhid: rx }] }).select('_id'),
  ]);
  return {
    $or: [
      { tripNo: rx }, { patientName: rx },
      { ambulance: { $in: ambulances.map((a) => a._id) } },
      { patient: { $in: patients.map((p) => p._id) } },
    ],
  };
}

export async function listTrips({ page, limit, search, status, ambulance }) {
  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (ambulance) filter.ambulance = ambulance;
  Object.assign(filter, await tripSearchFilter(search));

  const [items, total] = await Promise.all([
    AmbulanceTrip.find(filter).populate(TRIP_POPULATE).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    AmbulanceTrip.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function getTrip(id) {
  const trip = await AmbulanceTrip.findById(id).populate(TRIP_POPULATE);
  if (!trip) throw ApiError.notFound('Trip not found', 'TRIP_NOT_FOUND');
  return trip;
}

export async function tripRowsForExport({ search, status, ambulance }) {
  const { items } = await listTrips({ page: 1, limit: 100000, search, status, ambulance });
  return items.map((t) => ({
    'Trip No': t.tripNo,
    Vehicle: t.ambulance?.vehicleNo || '',
    Patient: t.patient ? `${t.patient.firstName} ${t.patient.lastName || ''}`.trim() : t.patientName,
    Pickup: t.pickup,
    Drop: t.drop,
    Purpose: t.purpose,
    Charges: t.charges,
    Status: t.status,
    'Started At': t.startedAt ? t.startedAt.toISOString() : '',
    'Ended At': t.endedAt ? t.endedAt.toISOString() : '',
  }));
}

export async function startTrip(data, userId) {
  const amb = await Ambulance.findById(data.ambulance);
  if (!amb) throw ApiError.badRequest('Ambulance does not exist', 'AMBULANCE_NOT_FOUND');
  if (amb.status !== 'AVAILABLE') throw ApiError.badRequest('Ambulance is not available', 'AMBULANCE_BUSY');
  const trip = new AmbulanceTrip({
    driverName: amb.driverName, driverPhone: amb.driverPhone,
    ...data, startedAt: new Date(), createdBy: userId,
  });
  await trip.save();
  amb.status = 'ON_TRIP';
  await amb.save();
  return trip.populate(TRIP_POPULATE);
}

// Only while ONGOING — once closed, a trip is a settled billing/audit record.
export async function updateTrip(id, data) {
  const trip = await AmbulanceTrip.findById(id);
  if (!trip) throw ApiError.notFound('Trip not found', 'TRIP_NOT_FOUND');
  if (trip.status !== 'ONGOING') throw ApiError.badRequest('Only an ongoing trip can be edited', 'TRIP_CLOSED');
  Object.assign(trip, data);
  await trip.save();
  return trip.populate(TRIP_POPULATE);
}

export async function endTrip(id, status) {
  if (!['COMPLETED', 'CANCELLED'].includes(status)) throw ApiError.badRequest('Invalid status', 'INVALID_STATUS');
  const trip = await AmbulanceTrip.findById(id);
  if (!trip) throw ApiError.notFound('Trip not found', 'TRIP_NOT_FOUND');
  if (trip.status !== 'ONGOING') throw ApiError.badRequest('Trip already closed', 'TRIP_CLOSED');
  trip.status = status;
  trip.endedAt = new Date();
  await trip.save();
  const amb = await Ambulance.findByIdAndUpdate(trip.ambulance, { status: 'AVAILABLE' }, { new: true });

  if (amb) {
    notify({
      role: 'RECEPTIONIST', type: 'AMBULANCE', title: 'Ambulance available',
      message: `${amb.vehicleNo} is back and available for dispatch.`,
      link: '/ambulance',
    });
  }

  return trip.populate(TRIP_POPULATE);
}

export async function ambulanceStats() {
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
  const [total, available, maintenance, ongoing, tripsToday, revenueAgg] = await Promise.all([
    Ambulance.countDocuments({}),
    Ambulance.countDocuments({ status: 'AVAILABLE' }),
    Ambulance.countDocuments({ status: 'MAINTENANCE' }),
    AmbulanceTrip.countDocuments({ status: 'ONGOING' }),
    AmbulanceTrip.countDocuments({ createdAt: { $gte: startOfDay } }),
    AmbulanceTrip.aggregate([
      { $match: { status: 'COMPLETED', createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$charges' } } },
    ]),
  ]);
  return { total, available, maintenance, ongoing, tripsToday, revenueThisMonth: revenueAgg[0]?.total || 0 };
}

export { TRIP_STATUSES };
