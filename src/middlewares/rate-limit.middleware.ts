import rateLimit from 'express-rate-limit';
import { createError } from '../common/errors/app-error';
import { env } from '../config/env';

export const createRateLimiter = ({ windowMs, limit }: { windowMs: number; limit: number }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(createError(429, 'Too many requests. Please try again later.', 'RATE_LIMITED')),
  });

const MINUTE = 60 * 1000;
const inTests = env.nodeEnv === 'test'; // keep other tests from tripping the limits

export const loginLimiter = createRateLimiter({ windowMs: 15 * MINUTE, limit: inTests ? 10_000 : 10 });
export const registerLimiter = createRateLimiter({ windowMs: 60 * MINUTE, limit: inTests ? 10_000 : 5 });
export const resendVerificationLimiter = createRateLimiter({ windowMs: 60 * MINUTE, limit: inTests ? 10_000 : 3 });
