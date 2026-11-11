import { Router } from 'express';
import {
  changePasswordHandler,
  forgotPasswordHandler,
  getMe,
  loginUser,
  logoutUser,
  register,
  resendVerificationHandler,
  resetPasswordHandler,
  verifyEmailHandler,
} from '../controllers/auth.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import {
  changePasswordLimiter,
  forgotAccountLimiter,
  forgotPasswordLimiter,
  loginAccountLimiter,
  loginLimiter,
  registerLimiter,
  resendAccountLimiter,
  resendVerificationLimiter,
  resetPasswordLimiter,
  verifyEmailLimiter,
} from '../middlewares/rate-limit.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../validators/auth.validator';

const router = Router();

router.post('/register', registerLimiter, validate(registerSchema), register); // students only
router.post('/verify-email', verifyEmailLimiter, validate(verifyEmailSchema), verifyEmailHandler);
router.post(
  '/resend-verification',
  resendVerificationLimiter,
  resendAccountLimiter,
  validate(resendVerificationSchema),
  resendVerificationHandler,
);
router.post('/login', loginLimiter, loginAccountLimiter, validate(loginSchema), loginUser);
router.post('/logout', logoutUser);
router.get('/me', requireAuth, getMe);

router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  forgotAccountLimiter,
  validate(forgotPasswordSchema),
  forgotPasswordHandler,
);
router.post('/reset-password', resetPasswordLimiter, validate(resetPasswordSchema), resetPasswordHandler);
router.post('/change-password', requireAuth, changePasswordLimiter, validate(changePasswordSchema), changePasswordHandler);

export default router;
