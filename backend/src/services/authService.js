import crypto from 'crypto';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { signToken } from '../utils/jwt.js';
import { deliver } from './channels.js';
import { getSettings } from './settingService.js';

// After this many consecutive failures the account is locked for a while.
// Slows credential stuffing to a crawl without ever permanently locking a
// real user out.
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const RESET_TOKEN_TTL_MINUTES = 30;

const hashResetToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

// Validate credentials and issue a JWT. Business logic lives here, not in the controller.
export async function loginUser({ email, password }, tenant = null) {
  // passwordHash has select:false, so explicitly request it.
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user) throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');

  if (user.isLocked()) {
    const mins = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    throw ApiError.forbidden(
      `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`,
      'ACCOUNT_LOCKED'
    );
  }

  const ok = await user.comparePassword(password);
  if (!ok) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
      user.failedLoginAttempts = 0;
    }
    await user.save();
    // Deliberately the same message whether the account exists or not, and
    // whether this attempt tripped the lock — nothing here tells an attacker
    // which emails are real.
    throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  if (user.status !== 'ACTIVE') {
    throw ApiError.forbidden('Account is not active', 'ACCOUNT_INACTIVE');
  }

  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date();
  await user.save();

  // Bake the tenant into the token so it can be cross-checked on every request.
  const token = signToken({ sub: user._id.toString(), role: user.role, tenant: tenant?.slug || null });
  return { token, user: user.toSafeJSON() };
}

// Self-service password change — requires proving the current password first.
export async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');

  const ok = await user.comparePassword(currentPassword);
  if (!ok) throw ApiError.unauthorized('Current password is incorrect', 'INVALID_CURRENT_PASSWORD');

  if (await user.comparePassword(newPassword)) {
    throw ApiError.badRequest('The new password must be different from the current one', 'PASSWORD_UNCHANGED');
  }

  await user.setPassword(newPassword);
  await user.save();
}

// Step 1 of forgot-password: mail a one-time link. Always resolves the same
// way whether or not the email exists, so this can't be used to discover
// which addresses have accounts.
export async function requestPasswordReset(email, { tenantSlug, clientUrl } = {}) {
  const user = await User.findOne({ email: String(email).toLowerCase() });
  if (!user || user.status !== 'ACTIVE') return;

  const rawToken = crypto.randomBytes(32).toString('hex');
  user.passwordResetTokenHash = hashResetToken(rawToken);
  user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60000);
  await user.save();

  const settings = await getSettings().catch(() => null);
  const base = (clientUrl || env.clientUrl || '').replace(/\/$/, '');
  const link = `${base}/reset-password?token=${rawToken}${tenantSlug ? `&hospital=${encodeURIComponent(tenantSlug)}` : ''}`;

  await deliver({
    email: user.email,
    subject: `Reset your ${settings?.hospitalName || 'HMS'} password`,
    text: `Hello ${user.name},\n\nUse the link below to set a new password. It expires in ${RESET_TOKEN_TTL_MINUTES} minutes and can only be used once.\n\n${link}\n\nIf you didn't request this, you can ignore this email — your password stays unchanged.`,
  }).catch(() => {
    // Delivery problems must not reveal whether the address exists.
  });
}

// Step 2: exchange the emailed token for a new password.
export async function resetPassword(rawToken, newPassword) {
  const user = await User.findOne({
    passwordResetTokenHash: hashResetToken(String(rawToken || '')),
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordHash +passwordResetTokenHash +passwordResetExpires');

  if (!user) throw ApiError.badRequest('This reset link is invalid or has expired', 'INVALID_RESET_TOKEN');

  // setPassword clears the reset token and the lockout, so the link is
  // single-use and a locked-out user is freed by completing a reset.
  await user.setPassword(newPassword);
  await user.save();
  return user.toSafeJSON();
}
