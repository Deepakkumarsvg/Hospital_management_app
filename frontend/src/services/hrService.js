import api from './api.js';

export const listEmployees = (params = {}) => api.get('/hr/employees', { params }).then((r) => r.data.data);
export const activeEmployees = () => api.get('/hr/employees/active').then((r) => r.data.data);
export const createEmployee = (p) => api.post('/hr/employees', p).then((r) => r.data.data);
export const updateEmployee = (id, p) => api.put(`/hr/employees/${id}`, p).then((r) => r.data.data);
export const deleteEmployee = (id) => api.delete(`/hr/employees/${id}`).then((r) => r.data);

export const listAttendance = (params = {}) => api.get('/hr/attendance', { params }).then((r) => r.data.data);
export const markAttendance = (p) => api.post('/hr/attendance', p).then((r) => r.data.data);

export const listLeaves = (params = {}) => api.get('/hr/leaves', { params }).then((r) => r.data.data);
export const createLeave = (p) => api.post('/hr/leaves', p).then((r) => r.data.data);
export const decideLeave = (id, status) => api.patch(`/hr/leaves/${id}/status`, { status }).then((r) => r.data.data);
export const getHrStats = () => api.get('/hr/stats').then((r) => r.data.data);
