import type { NextFunction, Request, Response } from 'express';
import { createError } from '../common/errors/app-error';
import { hasAnyRole } from '../utils/roles';
import { prisma } from '../utils/prisma';
import { hashToken, SESSION_COOKIE } from '../utils/token';
import { publicUserSelect } from '../utils/user-select';

// THE GUARD: "who are you?" -> 401 if we can't tell. On success it attaches the user to req.user.
export const requireAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || !token) {
      throw createError(401, 'Not signed in');
    }

    const session = await prisma.session.findFirst({
      where: { tokenHash: hashToken(token), expiresAt: { gt: new Date() } },
      include: { user: { select: publicUserSelect } },
    });
    if (!session || !session.user.isActive) {
      throw createError(401, 'Session invalid or expired');
    }
    if (!session.user.emailVerifiedAt) {
      throw createError(403, 'Email address is not verified', 'EMAIL_NOT_VERIFIED');
    }

    req.user = session.user;
    next();
  } catch (error) {
    next(error);
  }
};

// "are you allowed?" -> 403 if the user holds none of the roles. Runs requireAuth first.
// This is only the first gate: object-level and department-level checks still belong in the services.
export const requireRole = (...roles: string[]) => [
  requireAuth,
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !hasAnyRole(req.user, roles)) {
      return next(createError(403, 'Insufficient permissions'));
    }
    next();
  },
];
