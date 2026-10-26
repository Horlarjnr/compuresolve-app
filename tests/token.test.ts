import { describe, expect, test } from 'vitest';
import { CLEAR_COOKIE_OPTS, COOKIE_OPTS, generateToken, hashToken, SESSION_TTL_MS } from '../src/utils/token';

describe('tokens', () => {
  test('generateToken is long, random and unique', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  test('hashToken is deterministic and does not contain the token', () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });

  test('session cookie is HttpOnly, lasts 7 days, and clearing uses matching options', () => {
    expect(COOKIE_OPTS.httpOnly).toBe(true);
    expect(COOKIE_OPTS.sameSite).toBe('lax');
    expect(COOKIE_OPTS.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
    expect(SESSION_TTL_MS).toBe(COOKIE_OPTS.maxAge);
    expect(CLEAR_COOKIE_OPTS).not.toHaveProperty('maxAge');
    expect(CLEAR_COOKIE_OPTS.httpOnly).toBe(true);
  });
});
