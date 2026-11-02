import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

// Random token: goes into the cookie or an emailed link.
export const generateToken = () => randomBytes(32).toString('hex');

// What we store in the database. A leaked database gives no usable cookie or link.
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const baseCookieOptions = {
  httpOnly: true, // JavaScript in the browser cannot read it
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production
  path: '/',
};

// Used when setting the cookie at login.
export const COOKIE_OPTS = { ...baseCookieOptions, maxAge: SESSION_TTL_MS };
// Used when clearing it at logout (options must match).
export const CLEAR_COOKIE_OPTS = baseCookieOptions;
