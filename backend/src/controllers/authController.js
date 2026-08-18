import { asyncHandler, sendSuccess } from '../utils/apiResponse.js';
import * as authService from '../services/authService.js';
import { permissionsForRole } from '../services/roleService.js';
import * as sessions from '../services/sessionService.js';
import { REFRESH_TTL_DAYS } from '../services/sessionService.js';
import { env } from '../config/env.js';
import { audit } from '../utils/audit.js';

// The refresh token lives in an httpOnly cookie, never in a JSON body.
//
// Script on the page cannot read it, which is the whole point: an XSS bug can
// steal whatever the app itself can reach, and the long-lived credential is
// deliberately not one of those things. The access token stays in memory on the
// client and is short-lived enough that losing one is survivable.
const REFRESH_COOKIE = 'hms_rt';

const cookieOptions = () => ({
  httpOnly: true,
  secure: env.isProd,        // over TLS only in production
  sameSite: 'lax',           // survives top-level navigation, not cross-site posts
  path: '/api/auth',         // sent only to the endpoints that need it
  maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
});

const requestContext = (req) => ({
  userAgent: req.headers['user-agent'] || '',
  ip: req.ip || '',
});

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  try {
    const { token, refreshToken, user } = await authService.loginUser(req.body, req.tenant, requestContext(req));
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions());
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

// POST /api/auth/refresh
//
// Unauthenticated by design: the caller's access token has usually just
// expired, which is the reason they are here. The refresh cookie is the
// credential, and rotateSession() is what validates it.
export const refresh = asyncHandler(async (req, res) => {
  const presented = req.cookies?.[REFRESH_COOKIE];
  if (!presented) {
    return sendSuccess(res, { statusCode: 401, success: false, message: 'No session', data: null });
  }

  const { token, refreshToken, user } = await authService.refreshSession(presented, req.tenant, requestContext(req));
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions());
  sendSuccess(res, { message: 'Session refreshed', data: { token, user } });
});

// POST /api/auth/logout
//
// Actually ends the session now, rather than trusting the client to forget its
// token — which is all logging out used to do.
export const logout = asyncHandler(async (req, res) => {
  const presented = req.cookies?.[REFRESH_COOKIE];
  if (presented) await sessions.revokeSession(presented);
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });

  if (req.user) {
    audit(req, { action: 'LOGOUT', module: 'Auth', recordId: req.user._id, description: `${req.user.name} signed out` });
  }
  sendSuccess(res, { message: 'Logout successful', data: null });
});

// GET /api/auth/sessions — the devices this account is signed in on.
export const listSessions = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Active sessions', data: await sessions.listSessions(req.user._id) }));

// POST /api/auth/sessions/revoke-all — sign out everywhere.
export const revokeAllSessions = asyncHandler(async (req, res) => {
  const { revoked } = await sessions.revokeAllForUser(req.user._id, 'user requested');
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });
  audit(req, {
    action: 'UPDATE', module: 'Auth', recordId: req.user._id,
    description: `${req.user.name} signed out of all devices (${revoked})`,
  });
  sendSuccess(res, { message: `Signed out of ${revoked} session(s)`, data: { revoked } });
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
