import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as authService from '../services/authService.js';
import { permissionsForRole } from '../services/roleService.js';
import { audit } from '../utils/audit.js';

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  try {
    const { token, user } = await authService.loginUser(req.body, req.tenant);
    audit({ ...req, user: { _id: user.id, name: user.name } }, { action: 'LOGIN', module: 'Auth', recordId: user.id, description: `${user.name} logged in` });
    sendSuccess(res, { message: 'Login successful', data: { token, user } });
  } catch (err) {
    // Failed attempts are exactly what a security review looks for, so they
    // belong in the trail too — the email typed is enough to spot a spray,
    // and no password material is ever recorded.
    audit(req, {
      action: 'LOGIN_FAILED', module: 'Auth', recordId: req.body?.email || '',
      description: `Failed sign-in for ${req.body?.email || 'unknown'} — ${err.code || 'ERROR'}`,
    });
    throw err;
  }
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

// POST /api/auth/change-password
export const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user._id, req.body.currentPassword, req.body.newPassword);
  audit(req, { action: 'UPDATE', module: 'Auth', recordId: req.user._id, description: 'Changed own password' });
  sendSuccess(res, { message: 'Password changed successfully — please sign in again', data: null });
});

// POST /api/auth/forgot-password
export const forgotPassword = asyncHandler(async (req, res) => {
  await authService.requestPasswordReset(req.body.email, { tenantSlug: req.tenant?.slug });
  audit(req, { action: 'UPDATE', module: 'Auth', recordId: req.body.email, description: `Password reset requested for ${req.body.email}` });
  // Same response either way — this must not reveal which emails have accounts.
  sendSuccess(res, { message: 'If that email has an account, a reset link is on its way.', data: null });
});

// POST /api/auth/reset-password
export const resetPassword = asyncHandler(async (req, res) => {
  const user = await authService.resetPassword(req.body.token, req.body.newPassword);
  audit(req, { action: 'UPDATE', module: 'Auth', recordId: user.id, description: `${user.name} reset their password` });
  sendSuccess(res, { message: 'Password reset — you can now sign in', data: null });
});
