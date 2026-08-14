import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/notificationService.js';

export const list = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Notifications', data: await service.listForUser(req.user) }));
export const unreadCount = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Unread count', data: { count: await service.unreadCount(req.user) } }));
export const markRead = asyncHandler(async (req, res) => {
  await service.markRead(req.user, req.params.id);
  sendSuccess(res, { message: 'Marked read', data: null });
});
export const markAllRead = asyncHandler(async (req, res) => {
  await service.markAllRead(req.user);
  sendSuccess(res, { message: 'All marked read', data: null });
});
