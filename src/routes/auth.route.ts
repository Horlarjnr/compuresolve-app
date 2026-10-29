import { Router } from 'express';
import {
  getMe,
  loginUser,
  logoutUser,
  register,
  resendVerificationHandler,
  verifyEmailHandler,
} from '../controllers/auth.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { loginLimiter, registerLimiter, resendVerificationLimiter } from '../middlewares/rate-limit.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  verifyEmailSchema,
} from '../validators/auth.validator';

const router = Router();

router.post('/register', registerLimiter, validate(registerSchema), register); // students only
router.post('/verify-email', validate(verifyEmailSchema), verifyEmailHandler);
router.post('/resend-verification', resendVerificationLimiter, validate(resendVerificationSchema), resendVerificationHandler);
router.post('/login', loginLimiter, validate(loginSchema), loginUser);
router.post('/logout', logoutUser);
router.get('/me', requireAuth, getMe);

export default router;
