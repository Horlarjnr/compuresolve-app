import type { NextFunction, Request, Response } from 'express';
import { createError } from '../common/errors/app-error';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const originOf = (value: string) => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

// CSRF defence for cookie sessions: a state-changing request (POST/PATCH/PUT/DELETE) sent by a BROWSER always
// carries an Origin (or at least a Referer). If it names a site that is not our frontend, refuse it.
// Requests with neither header (Thunder Client, curl, server-to-server) are not browser form attacks, so they pass:
// they still need a valid session cookie and the normal authorization checks.
export const csrfOriginCheck = (allowedOrigins: readonly string[]) => {
  const allowed = new Set(allowedOrigins);
  return (req: Request, _res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = req.get('origin');
    if (origin !== undefined) {
      return allowed.has(origin) ? next() : next(createError(403, 'Request origin not allowed', 'CSRF_ORIGIN'));
    }
    const referer = req.get('referer');
    if (referer !== undefined) {
      const refererOrigin = originOf(referer);
      return refererOrigin && allowed.has(refererOrigin)
        ? next()
        : next(createError(403, 'Request origin not allowed', 'CSRF_ORIGIN'));
    }
    return next();
  };
};
