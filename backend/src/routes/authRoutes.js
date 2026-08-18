import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { rateLimitStore } from '../config/rateLimitStore.js';
import {
  loginSchema, changePasswordSchema, forgotPasswordSchema, resetPasswordSchema,
} from '../validators/authValidator.js';

const router = Router();

// The app-wide limit (500/15min) is far too generous for credential guessing —
// these endpoints get their own much tighter budget, keyed per IP. Account
// lockout in authService covers the distributed case where the IP rotates.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only failures burn the budget
  store: rateLimitStore('auth'),
  message: { success: false, message: 'Too many attempts. Please try again later.' },
});

// Reset requests send mail, so they're throttled on every call, not just failures.
const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: rateLimitStore('reset'),
  message: { success: false, message: 'Too many reset requests. Please try again later.' },
});

// Refreshing is throttled too — a stolen refresh cookie should not be able to
// mint access tokens at machine speed — but far more loosely than signing in,
// since a busy tab legitimately refreshes on a timer.
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: rateLimitStore('refresh'),
  message: { success: false, message: 'Too many refresh attempts. Please sign in again.' },
});

router.post('/login', authLimiter, validate(loginSchema), authController.login);
// Deliberately unauthenticated: the caller is here precisely because their
// access token has expired. The refresh cookie is the credential.
router.post('/refresh', refreshLimiter, authController.refresh);
// Logout works with or without a valid access token — a session must still be
// endable once the access token has expired.
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);
router.get('/sessions', authenticate, authController.listSessions);
router.post('/sessions/revoke-all', authenticate, authController.revokeAllSessions);
router.post('/change-password', authenticate, validate(changePasswordSchema), authController.changePassword);
router.post('/forgot-password', resetLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), authController.resetPassword);

export default router;
