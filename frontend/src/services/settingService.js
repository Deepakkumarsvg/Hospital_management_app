import api from './api.js';

export const getSettings = () => api.get('/settings').then((r) => r.data.data);
export const updateSettings = (payload) => api.put('/settings', payload).then((r) => r.data.data);
