import { Notification } from '../models/Notification.js';

// Fire-and-forget creator. Safe to call from anywhere.
export function notify({ user = null, role = null, type = 'INFO', title, message = '', link = '' }) {
  Notification.create({ user, role, type, title, message, link }).catch(() => {});
}

// Which notifications a user can see.
//
// Admins used to get an unfiltered `{}` — every notification in the hospital,
// including ones addressed to a specific individual. That is not oversight, it
// is a bell that never stops ringing and a stream of other people's business:
// "your lab report is ready" for one named doctor is not an administrator's
// business, and the volume made the feature useless besides.
//
// Everyone, admins included, now sees notifications addressed to them, to their
// role, or to nobody in particular. Broadcast alerts (low stock, expiries) carry
// a role rather than a user, so they still reach the people who act on them, and
// the audit log — not the notification bell — is where oversight lives.
function scopeFor(user) {
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
