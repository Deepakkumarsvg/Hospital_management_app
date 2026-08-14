import { Notification } from '../models/Notification.js';
import { ROLES } from '../config/roles.js';

// Fire-and-forget creator. Safe to call from anywhere.
export function notify({ user = null, role = null, type = 'INFO', title, message = '', link = '' }) {
  Notification.create({ user, role, type, title, message, link }).catch(() => {});
}

// Which notifications a user can see. Admins get oversight of everything.
function scopeFor(user) {
  if ([ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role)) return {};
  return { $or: [{ user: user._id }, { role: user.role }, { user: null, role: null }] };
}

export async function listForUser(user, { limit = 30 } = {}) {
  return Notification.find(scopeFor(user)).sort({ createdAt: -1 }).limit(limit);
}
export async function unreadCount(user) {
  return Notification.countDocuments({ ...scopeFor(user), read: false });
}
export async function markRead(user, id) {
  await Notification.updateOne({ _id: id, ...scopeFor(user) }, { read: true });
}
export async function markAllRead(user) {
  await Notification.updateMany({ ...scopeFor(user), read: false }, { read: true });
}
