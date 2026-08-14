import api from './api.js';

export const listNotifications = () => api.get('/notifications').then((r) => r.data.data);
export const unreadCount = () => api.get('/notifications/unread-count').then((r) => r.data.data.count);
export const markRead = (id) => api.patch(`/notifications/${id}/read`).then((r) => r.data);
export const markAllRead = () => api.patch('/notifications/read-all').then((r) => r.data);
