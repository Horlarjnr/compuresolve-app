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

// Key for per-ACCOUNT limits: the email in the request body. Campus networks share one public IP, so the strict
// limits are per account and the per-IP limits are deliberately loose. (A request without an email shares one bucket,
// which only ever affects requests that would fail validation anyway.)
export const emailKey = (req: Request) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : '';
  return email ? `email:${email}` : 'email:none';
};

// Safety net for the whole API (health checks are mounted before it). Counted per IP: needs a correct TRUST_PROXY.
export const globalLimiter = createRateLimiter({ windowMs: 15 * MINUTE, limit: inTests ? 100_000 : env.globalRateLimit });
export const verifyEmailLimiter = createRateLimiter({ windowMs: 15 * MINUTE, limit: inTests ? 10_000 : 60 });

// Login: strict per account (stops guessing one person's password), loose per IP (stops one machine trying many accounts).
export const loginLimiter = createRateLimiter({ windowMs: 15 * MINUTE, limit: inTests ? 10_000 : 100 });
export const loginAccountLimiter = createRateLimiter({ windowMs: 15 * MINUTE, limit: inTests ? 10_000 : 10, keyGenerator: emailKey });
// Registration: a whole campus can share one IP in registration week, so the limit is generous.
export const registerLimiter = createRateLimiter({ windowMs: 60 * MINUTE, limit: inTests ? 10_000 : 30 });
export const resendVerificationLimiter = createRateLimiter({ windowMs: 60 * MINUTE, limit: inTests ? 10_000 : 30 });
export const resendAccountLimiter = createRateLimiter({ windowMs: 60 * MINUTE, limit: inTests ? 10_000 : 3, keyGenerator: emailKey });
export const createInvitationLimiter = createRateLimiter({ windowMs: 60 * MINUTE, limit: inTests ? 10_000 : 30 });
export const acceptInvitationLimiter = createRateLimiter({ windowMs: 15 * MINUTE, limit: inTests ? 10_000 : 10 });
export const forgotPasswordLimiter = createRateLimiter({ windowMs: 60 * MINUTE, limit: inTests ? 10_000 : 30 });
export const forgotAccountLimiter = createRateLimiter({ windowMs: 60 * MINUTE, limit: inTests ? 10_000 : 3, keyGenerator: emailKey });
export const resetPasswordLimiter = createRateLimiter({ windowMs: 60 * MINUTE, limit: inTests ? 10_000 : 60 });
// Signed in: counted per person, not per IP.
export const changePasswordLimiter = createRateLimiter({
  windowMs: 15 * MINUTE,
  limit: inTests ? 10_000 : 5,
  keyGenerator: (req) => req.user!.id,
});

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

export const messageLimiter = createRateLimiter({
  windowMs: 60 * MINUTE,
  limit: inTests ? 10_000 : 30,
  keyGenerator: (req) => req.user!.id,
});
