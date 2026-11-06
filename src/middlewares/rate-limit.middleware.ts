import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { createError } from '../common/errors/app-error';
import { env } from '../config/env';

export const createRateLimiter = ({
  windowMs,
  limit,
  keyGenerator,
}: {
  windowMs: number;
  limit: number;
  keyGenerator?: (req: Request) => string;
}) =>
  rateLimit({
    windowMs,
    limit,
    ...(keyGenerator ? { keyGenerator } : {}),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(createError(429, 'Too many requests. Please try again later.', 'RATE_LIMITED')),
  });

const MINUTE = 60 * 1000;
const inTests = env.nodeEnv === 'test'; // keep other tests from tripping the limits

export const loginLimiter = createRateLimiter({ windowMs: 15 * MINUTE, limit: inTests ? 10_000 : 10 });
export const registerLimiter = createRateLimiter({ windowMs: 60 * MINUTE, limit: inTests ? 10_000 : 5 });
export const resendVerificationLimiter = createRateLimiter({ windowMs: 60 * MINUTE, limit: inTests ? 10_000 : 3 });
export const createInvitationLimiter = createRateLimiter({ windowMs: 60 * MINUTE, limit: inTests ? 10_000 : 30 });
export const acceptInvitationLimiter = createRateLimiter({ windowMs: 15 * MINUTE, limit: inTests ? 10_000 : 10 });
export const forgotPasswordLimiter = createRateLimiter({ windowMs: 60 * MINUTE, limit: inTests ? 10_000 : 3 });
export const resetPasswordLimiter = createRateLimiter({ windowMs: 60 * MINUTE, limit: inTests ? 10_000 : 10 });
export const changePasswordLimiter = createRateLimiter({ windowMs: 15 * MINUTE, limit: inTests ? 10_000 : 5 });

// Per signed-in student (not per IP): campus networks share addresses. Used after requireRole, so req.user exists.
export const complaintLimiter = createRateLimiter({
  windowMs: 60 * MINUTE,
  limit: inTests ? 10_000 : 10,
  keyGenerator: (req) => req.user!.id,
});

export const reopenRequestLimiter = createRateLimiter({
  windowMs: 60 * MINUTE,
  limit: inTests ? 10_000 : 5,
  keyGenerator: (req) => req.user!.id,
});
