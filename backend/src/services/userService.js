import { User } from '../models/User.js';
import { Doctor } from '../models/Doctor.js';
import { ApiError } from '../utils/ApiError.js';

export async function listUsers({ page, limit, search, role }) {
  const filter = {};
  if (role && role !== 'ALL') filter.role = role;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const [items, total] = await Promise.all([
    User.find(filter).populate('department', 'name code').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function getUser(id) {
  const user = await User.findById(id).populate('department', 'name code').populate('patient', 'uhid firstName lastName');
  if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
  // Doctor accounts link the other way (Doctor.user -> User), so it isn't a
  // field on User itself — look it up separately when relevant.
  const linkedDoctor = user.role === 'DOCTOR'
    ? await Doctor.findOne({ user: id }).select('fullName specialization')
    : null;
  return { user, linkedDoctor };
}

export async function userStats() {
  const [total, active, suspended, byRole] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ status: 'ACTIVE' }),
    User.countDocuments({ status: 'SUSPENDED' }),
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
  ]);
  return { total, active, suspended, byRole: byRole.map((r) => ({ role: r._id, count: r.count })) };
}

export async function createUser({ password, ...data }) {
  const exists = await User.findOne({ email: data.email });
  if (exists) throw ApiError.conflict('A user with this email already exists', 'EMAIL_TAKEN');

  const user = new User(data);
  await user.setPassword(password);
  await user.save();
  return user;
}

export async function updateUser(id, { password, ...data }, actingUser) {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');

  // Guard: an admin must not lock themselves out by demoting/suspending self.
  if (actingUser && user._id.equals(actingUser._id)) {
    if (data.role && data.role !== user.role) {
      throw ApiError.badRequest('You cannot change your own role', 'SELF_ROLE_CHANGE');
    }
    if (data.status && data.status !== 'ACTIVE') {
      throw ApiError.badRequest('You cannot deactivate your own account', 'SELF_DEACTIVATE');
    }
  }

  Object.assign(user, data);
  if (password) await user.setPassword(password);
  await user.save();
  return user;
}

export async function deleteUser(id, actingUser) {
  if (actingUser && actingUser._id.equals(id)) {
    throw ApiError.badRequest('You cannot delete your own account', 'SELF_DELETE');
  }
  const user = await User.findByIdAndDelete(id);
  if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
  return user;
}
