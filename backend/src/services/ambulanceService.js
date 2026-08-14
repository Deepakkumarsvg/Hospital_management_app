import { Ambulance } from '../models/Ambulance.js';
import { AmbulanceTrip, TRIP_STATUSES } from '../models/AmbulanceTrip.js';
import { ApiError } from '../utils/ApiError.js';

export const listAmbulances = () => Ambulance.find().sort({ vehicleNo: 1 });
export const createAmbulance = (data) => Ambulance.create(data);
export async function updateAmbulance(id, data) {
  const a = await Ambulance.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!a) throw ApiError.notFound('Ambulance not found', 'AMBULANCE_NOT_FOUND');
  return a;
}
export async function deleteAmbulance(id) {
  const a = await Ambulance.findByIdAndDelete(id);
  if (!a) throw ApiError.notFound('Ambulance not found', 'AMBULANCE_NOT_FOUND');
  return a;
}

export async function listTrips() {
  return AmbulanceTrip.find().populate('ambulance', 'vehicleNo type').sort({ createdAt: -1 }).limit(100);
}
export async function startTrip(data, userId) {
  const amb = await Ambulance.findById(data.ambulance);
  if (!amb) throw ApiError.badRequest('Ambulance does not exist', 'AMBULANCE_NOT_FOUND');
  if (amb.status !== 'AVAILABLE') throw ApiError.badRequest('Ambulance is not available', 'AMBULANCE_BUSY');
  const trip = new AmbulanceTrip({ ...data, createdBy: userId });
  await trip.save();
  amb.status = 'ON_TRIP';
  await amb.save();
  return trip.populate('ambulance', 'vehicleNo type');
}
export async function endTrip(id, status) {
  if (!['COMPLETED', 'CANCELLED'].includes(status)) throw ApiError.badRequest('Invalid status', 'INVALID_STATUS');
  const trip = await AmbulanceTrip.findById(id);
  if (!trip) throw ApiError.notFound('Trip not found', 'TRIP_NOT_FOUND');
  if (trip.status !== 'ONGOING') throw ApiError.badRequest('Trip already closed', 'TRIP_CLOSED');
  trip.status = status;
  await trip.save();
  await Ambulance.findByIdAndUpdate(trip.ambulance, { status: 'AVAILABLE' });
  return trip.populate('ambulance', 'vehicleNo type');
}
export async function ambulanceStats() {
  const [total, available, ongoing] = await Promise.all([
    Ambulance.countDocuments({}),
    Ambulance.countDocuments({ status: 'AVAILABLE' }),
    AmbulanceTrip.countDocuments({ status: 'ONGOING' }),
  ]);
  return { total, available, ongoing };
}

export { TRIP_STATUSES };
