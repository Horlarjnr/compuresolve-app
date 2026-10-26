import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock('../src/utils/prisma', () => ({ prisma: { session: { findFirst } } }));

import { errorHandler } from '../src/middlewares/error.middleware';
import { requireAuth, requireRole } from '../src/middlewares/auth.middleware';
import { hashToken } from '../src/utils/token';

const baseUser = {
  id: 'u1',
  fullName: 'Ada Student',
  email: 'ada@example.com',
  matricNumber: 'CSC/2021/001',
  isActive: true,
  emailVerifiedAt: new Date(),
  memberships: [{ departmentId: 'd1', role: 'STUDENT' }],
  facultyRoles: [],
  studentProfile: { level: 'L200' },
};

const app = express();
app.use(cookieParser());
app.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, data: req.user });
});
app.get('/hod-only', ...requireRole('HOD'), (_req, res) => {
  res.json({ success: true });
});
app.get('/admin-only', ...requireRole('FACULTY_ADMIN'), (_req, res) => {
  res.json({ success: true });
});
app.use(errorHandler);

const withSession = (user: object) => findFirst.mockResolvedValue({ user });
const cookie = ['sid=raw-token-value'];

beforeEach(() => findFirst.mockReset());

describe('requireAuth', () => {
  test('401 without a cookie (and never queries the database)', async () => {
    const res = await request(app).get('/me');
    expect(res.status).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();
  });

  test('401 for an unknown or expired session', async () => {
    findFirst.mockResolvedValue(null);
    const res = await request(app).get('/me').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  test('looks the session up by token HASH and only unexpired sessions', async () => {
    withSession(baseUser);
    await request(app).get('/me').set('Cookie', cookie);
    const where = findFirst.mock.calls[0][0].where;
    expect(where.tokenHash).toBe(hashToken('raw-token-value'));
    expect(JSON.stringify(where)).not.toContain('raw-token-value');
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
  });

  test('401 for a deactivated account', async () => {
    withSession({ ...baseUser, isActive: false });
    expect((await request(app).get('/me').set('Cookie', cookie)).status).toBe(401);
  });

  test('403 EMAIL_NOT_VERIFIED when the email is not verified', async () => {
    withSession({ ...baseUser, emailVerifiedAt: null });
    const res = await request(app).get('/me').set('Cookie', cookie);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  test('200 and attaches the user; response never contains a password hash', async () => {
    withSession(baseUser);
    const res = await request(app).get('/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('ada@example.com');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/i);
  });
});

describe('requireRole', () => {
  test('student cannot reach HOD or Faculty Admin routes (403)', async () => {
    withSession(baseUser);
    expect((await request(app).get('/hod-only').set('Cookie', cookie)).status).toBe(403);
    expect((await request(app).get('/admin-only').set('Cookie', cookie)).status).toBe(403);
  });

  test('HOD membership passes the HOD route', async () => {
    withSession({ ...baseUser, memberships: [{ departmentId: 'd1', role: 'HOD' }] });
    expect((await request(app).get('/hod-only').set('Cookie', cookie)).status).toBe(200);
  });

  test('faculty role passes the Faculty Admin route', async () => {
    withSession({ ...baseUser, memberships: [], facultyRoles: [{ role: 'FACULTY_ADMIN' }] });
    expect((await request(app).get('/admin-only').set('Cookie', cookie)).status).toBe(200);
  });

  test('401 (not 403) when signed out', async () => {
    expect((await request(app).get('/hod-only')).status).toBe(401);
  });
});
