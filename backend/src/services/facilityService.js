import { Ward } from '../models/Ward.js';
import { Room } from '../models/Room.js';
import { Bed } from '../models/Bed.js';
import { ApiError } from '../utils/ApiError.js';

// ---------- Wards ----------
export async function listWards() {
  return Ward.find().populate('department', 'name code').sort({ name: 1 });
}
export async function createWard(data) {
  return Ward.create(data);
}
export async function updateWard(id, data) {
  const ward = await Ward.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!ward) throw ApiError.notFound('Ward not found', 'WARD_NOT_FOUND');
  return ward;
}
export async function deleteWard(id) {
  const bedCount = await Bed.countDocuments({ ward: id });
  if (bedCount) throw ApiError.badRequest('Remove beds in this ward first', 'WARD_NOT_EMPTY');
  const ward = await Ward.findByIdAndDelete(id);
  if (!ward) throw ApiError.notFound('Ward not found', 'WARD_NOT_FOUND');
  await Room.deleteMany({ ward: id });
  return ward;
}

// ---------- Rooms ----------
export async function listRooms(ward) {
  const filter = ward ? { ward } : {};
  return Room.find(filter).populate('ward', 'name code').sort({ roomNo: 1 });
}
export async function createRoom(data) {
  const ward = await Ward.findById(data.ward).select('_id');
  if (!ward) throw ApiError.badRequest('Ward does not exist', 'WARD_NOT_FOUND');
  return Room.create(data);
}
export async function updateRoom(id, data) {
  const room = await Room.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!room) throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
  return room;
}
export async function deleteRoom(id) {
  const bedCount = await Bed.countDocuments({ room: id });
  if (bedCount) throw ApiError.badRequest('Remove beds in this room first', 'ROOM_NOT_EMPTY');
  const room = await Room.findByIdAndDelete(id);
  if (!room) throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
  return room;
}

// ---------- Beds ----------
export async function listBeds({ ward, status } = {}) {
  const filter = {};
  if (ward) filter.ward = ward;
  if (status) filter.status = status;
  return Bed.find(filter).populate('room', 'roomNo').populate('ward', 'name code').sort({ bedNo: 1 });
}
export async function createBed(data) {
  const room = await Room.findById(data.room).select('ward');
  if (!room) throw ApiError.badRequest('Room does not exist', 'ROOM_NOT_FOUND');
  return Bed.create({ ...data, ward: room.ward });
}
export async function updateBed(id, data) {
  const bed = await Bed.findById(id);
  if (!bed) throw ApiError.notFound('Bed not found', 'BED_NOT_FOUND');
  if (bed.status === 'OCCUPIED' && data.status && data.status !== 'OCCUPIED') {
    throw ApiError.badRequest('Cannot change status of an occupied bed; discharge first', 'BED_OCCUPIED');
  }
  Object.assign(bed, data);
  await bed.save();
  return bed;
}
export async function deleteBed(id) {
  const bed = await Bed.findById(id);
  if (!bed) throw ApiError.notFound('Bed not found', 'BED_NOT_FOUND');
  if (bed.status === 'OCCUPIED') throw ApiError.badRequest('Cannot delete an occupied bed', 'BED_OCCUPIED');
  await bed.deleteOne();
  return bed;
}

// Available beds for admission dropdowns.
export async function availableBeds(ward) {
  const filter = { status: 'AVAILABLE' };
  if (ward) filter.ward = ward;
  return Bed.find(filter).populate('room', 'roomNo').populate('ward', 'name code').sort({ bedNo: 1 });
}

// Flat rows for CSV/XLSX export.
export async function bedRowsForExport({ ward, status } = {}) {
  const filter = {};
  if (ward) filter.ward = ward;
  if (status) filter.status = status;
  const beds = await Bed.find(filter)
    .populate('room', 'roomNo')
    .populate('ward', 'name code')
    .populate('currentAdmission', 'admissionNo')
    .sort({ bedNo: 1 });

  return beds.map((b) => ({
    Ward: b.ward?.name || '',
    'Ward Code': b.ward?.code || '',
    Room: b.room?.roomNo || '',
    'Bed No': b.bedNo,
    Status: b.status,
    'Daily Charge': b.dailyCharge,
    'Current Admission': b.currentAdmission?.admissionNo || '',
  }));
}

// Bed map: wards → rooms → beds, plus availability counts.
export async function bedMap() {
  const [wards, rooms, beds] = await Promise.all([
    Ward.find({ status: 'ACTIVE' }).populate('department', 'name code').sort({ name: 1 }).lean(),
    Room.find().lean(),
    Bed.find().populate('currentAdmission', 'admissionNo').lean(),
  ]);

  const bedsByRoom = {};
  for (const b of beds) (bedsByRoom[b.room] ||= []).push(b);
  const roomsByWard = {};
  for (const r of rooms) (roomsByWard[r.ward] ||= []).push(r);

  const map = wards.map((w) => {
    const wardRooms = (roomsByWard[w._id] || []).map((r) => ({
      ...r,
      beds: (bedsByRoom[r._id] || []).sort((a, b) => a.bedNo.localeCompare(b.bedNo)),
    }));
    const wardBeds = wardRooms.flatMap((r) => r.beds);
    return {
      ...w,
      rooms: wardRooms.sort((a, b) => a.roomNo.localeCompare(b.roomNo)),
      counts: {
        total: wardBeds.length,
        available: wardBeds.filter((b) => b.status === 'AVAILABLE').length,
        occupied: wardBeds.filter((b) => b.status === 'OCCUPIED').length,
      },
    };
  });

  const totals = {
    total: beds.length,
    available: beds.filter((b) => b.status === 'AVAILABLE').length,
    occupied: beds.filter((b) => b.status === 'OCCUPIED').length,
    reserved: beds.filter((b) => b.status === 'RESERVED').length,
    maintenance: beds.filter((b) => b.status === 'MAINTENANCE').length,
  };
  return { wards: map, totals };
}
