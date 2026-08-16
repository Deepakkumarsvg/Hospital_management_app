import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as service from '../services/userService.js';
import { ROLE_DEFINITIONS } from '../config/roles.js';

// GET /api/users
export const listUsers = asyncHandler(async (req, res) => {
  const { items, pagination } = await service.listUsers(req.query);
  sendSuccess(res, {
    message: 'Users fetched',
    data: items.map((u) => ({ ...u.toSafeJSON(), department: u.department })),
    meta: pagination,
  });
});

// GET /api/users/roles — the role catalogue (for dropdowns).
export const listRoles = asyncHandler(async (_req, res) => {
  sendSuccess(res, { message: 'Roles', data: ROLE_DEFINITIONS });
});

// GET /api/users/stats
export const stats = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'User stats', data: await service.userStats() }));

// GET /api/users/:id
export const getUser = asyncHandler(async (req, res) => {
  const { user, linkedDoctor } = await service.getUser(req.params.id);
  sendSuccess(res, {
    message: 'User fetched',
    data: { ...user.toSafeJSON(), department: user.department, linkedDoctor },
  });
});

// POST /api/users
export const createUser = asyncHandler(async (req, res) => {
  const user = await service.createUser(req.body);
  sendSuccess(res, { statusCode: 201, message: 'User created successfully', data: user.toSafeJSON() });
});

// PUT /api/users/:id
export const updateUser = asyncHandler(async (req, res) => {
  const user = await service.updateUser(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'User updated successfully', data: user.toSafeJSON() });
});

// DELETE /api/users/:id
export const deleteUser = asyncHandler(async (req, res) => {
  await service.deleteUser(req.params.id, req.user);
  sendSuccess(res, { message: 'User deleted successfully', data: null });
});
