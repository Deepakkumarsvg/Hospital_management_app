import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
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
  message: { success: false, message: 'Too many attempts. Please try again later.' },
});

// Reset requests send mail, so they're throttled on every call, not just failures.
const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many reset requests. Please try again later.' },
});

router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.me);
router.post('/change-password', authenticate, validate(changePasswordSchema), authController.changePassword);
router.post('/forgot-password', resetLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), authController.resetPassword);

export default router;
