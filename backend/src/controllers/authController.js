import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as authService from '../services/authService.js';
import { permissionsForRole } from '../services/roleService.js';
import { audit } from '../utils/audit.js';

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const { token, user } = await authService.loginUser(req.body, req.tenant);
  audit({ ...req, user: { _id: user.id, name: user.name } }, { action: 'LOGIN', module: 'Auth', recordId: user.id, description: `${user.name} logged in` });
  sendSuccess(res, { message: 'Login successful', data: { token, user } });
});

// GET /api/auth/me  (requires authenticate middleware)
export const me = asyncHandler(async (req, res) => {
  const user = req.user.toSafeJSON();
  user.permissions = await permissionsForRole(req.user.role);
  sendSuccess(res, { message: 'Current user', data: { user } });
});

// POST /api/auth/logout
// Stateless JWT: client discards the token. Endpoint exists for audit/symmetry.
export const logout = asyncHandler(async (_req, res) => {
  sendSuccess(res, { message: 'Logout successful', data: null });
});
