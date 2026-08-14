import api from './api.js';

export const getRoles = () => api.get('/roles').then((r) => r.data.data);
export const getPermissionCatalog = () => api.get('/roles/permissions/catalog').then((r) => r.data.data);
export const updateRolePermissions = (name, permissions) =>
  api.put(`/roles/${name}/permissions`, { permissions }).then((r) => r.data.data);
