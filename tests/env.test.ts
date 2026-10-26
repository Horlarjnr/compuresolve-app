import { describe, expect, test } from 'vitest';
import { parseEnv } from '../src/config/env';

const DB = 'postgresql://u:p@ep-xxxx-pooler.neon.tech/neondb?sslmode=require';

describe('parseEnv', () => {
  test('applies safe defaults', () => {
    const c = parseEnv({ DATABASE_URL: DB });
    expect(c.port).toBe(8080);
    expect(c.nodeEnv).toBe('development');
    expect(c.frontendOrigins).toEqual(['http://localhost:3000']);
    expect(c.directUrl).toBeUndefined();
  });

  test('DATABASE_URL is required outside tests, optional in tests', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(parseEnv({ NODE_ENV: 'test' }).databaseUrl).toBeUndefined();
  });

  test('rejects an invalid PORT without echoing the value', () => {
    expect(() => parseEnv({ DATABASE_URL: DB, PORT: 'abc-secret' })).toThrow(/PORT/);
    try {
      parseEnv({ DATABASE_URL: DB, PORT: 'abc-secret' });
    } catch (e) {
      expect((e as Error).message).not.toContain('abc-secret');
    }
  });

  test('requires FRONTEND_ORIGINS in production', () => {
    expect(() => parseEnv({ NODE_ENV: 'production', DATABASE_URL: DB })).toThrow(/FRONTEND_ORIGINS/);
  });

  test('rejects wildcard and path-bearing origins', () => {
    expect(() => parseEnv({ DATABASE_URL: DB, FRONTEND_ORIGINS: '*' })).toThrow(/FRONTEND_ORIGINS/);
    expect(() => parseEnv({ DATABASE_URL: DB, FRONTEND_ORIGINS: 'http://localhost:3000/' })).toThrow(
      /FRONTEND_ORIGINS/,
    );
  });

  test('accepts postgres URLs, treats empty DIRECT_URL as unset, rejects junk without echoing it', () => {
    const ok = parseEnv({ DATABASE_URL: DB, DIRECT_URL: '' });
    expect(ok.databaseUrl).toContain('postgresql://');
    expect(ok.directUrl).toBeUndefined();
    try {
      parseEnv({ DATABASE_URL: 'mysql://user:topsecret@host/db' });
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as Error).message).toMatch(/DATABASE_URL/);
      expect((e as Error).message).not.toContain('topsecret');
    }
  });

  test('mail defaults to console in development and never needs SMTP values there', () => {
    const c = parseEnv({ DATABASE_URL: DB });
    expect(c.mailMode).toBe('console');
    expect(c.smtp).toBeUndefined();
  });

  test('smtp mode requires host, user and pass, and never echoes the password', () => {
    expect(() => parseEnv({ DATABASE_URL: DB, MAIL_MODE: 'smtp' })).toThrow(/SMTP_HOST/);
    const c = parseEnv({
      DATABASE_URL: DB,
      MAIL_MODE: 'smtp',
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_USER: 'me@gmail.com',
      SMTP_PASS: 'app-pass-secret',
    });
    expect(c.smtp).toEqual({ host: 'smtp.gmail.com', port: 465, user: 'me@gmail.com', pass: 'app-pass-secret' });
    try {
      parseEnv({ DATABASE_URL: DB, MAIL_MODE: 'smtp', SMTP_PASS: 'app-pass-secret' });
    } catch (e) {
      expect((e as Error).message).not.toContain('app-pass-secret');
    }
  });

  test('production must use smtp (console would print one-time links)', () => {
    expect(() =>
      parseEnv({ NODE_ENV: 'production', DATABASE_URL: DB, FRONTEND_ORIGINS: 'https://app.example.com' }),
    ).toThrow(/MAIL_MODE/);
  });

  test('enum errors name the variable but never echo the bad value', () => {
    try {
      parseEnv({ DATABASE_URL: DB, MAIL_MODE: 'oops-value-123' });
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as Error).message).toMatch(/MAIL_MODE/);
      expect((e as Error).message).not.toContain('oops-value-123');
    }
  });
});
