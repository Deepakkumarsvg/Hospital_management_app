import api from './api.js';

// Live status of outbound integrations (email/SMS/payments) — shows whether
// real credentials are configured or the system is running in dev/log mode.
export const getOpsStatus = () => api.get('/ops/status').then((r) => r.data.data);

// Manually kick off the hourly appointment-reminder job instead of waiting.
export const runReminders = () => api.post('/ops/reminders/run').then((r) => r.data.data);
