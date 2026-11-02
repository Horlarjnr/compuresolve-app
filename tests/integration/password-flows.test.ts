import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

const mail = vi.hoisted(() => ({ resetToken: '', resets: 0, changed: 0 }));
vi.mock('../../src/services/mail.service', () => ({
  sendVerificationEmail: vi.fn(),
  sendStaffInvitationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(async (_to: string, _name: string, token: string) => {
    mail.resetToken = token;
    mail.resets += 1;
  }),
  sendPasswordChangedEmail: vi.fn(async () => {
    mail.changed += 1;
  }),
}));

import app from '../../src/app';
import { hashPassword } from '../../src/utils/password';
import { prisma } from '../../src/utils/prisma';

const OLD = 'Old!Passw0rd#';
const NEW = 'N3w!Passw0rd#';
const DOMAIN = '@pwd.invalid';
let seq = 0;
let passwordHash = '';

const cleanup = () => prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });

beforeAll(async () => {
  await cleanup();
  passwordHash = await hashPassword(OLD);
}, 120_000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const makeUser = async (verified = true) => {
  seq += 1;
  const email = `u${Date.now()}x${seq}${DOMAIN}`;
  await prisma.user.create({
    data: { fullName: 'Pwd Tester', email, passwordHash, emailVerifiedAt: verified ? new Date() : null },
  });
  return email;
};

const post = (path: string, body: object, cookie?: string) => {
  const r = request(app).post(`/api/v1${path}`);
  if (cookie) r.set('Cookie', cookie);
  return r.send(body);
};

const login = async (email: string, password: string) => {
  const res = await post('/auth/login', { email, password });
  const raw = ((res.headers['set-cookie'] as unknown as string[] | undefined) ?? []).find((c) => c.startsWith('sid='));
  return { res, cookie: raw ? raw.split(';')[0] : '' };
};

const me = (cookie: string) => request(app).get('/api/v1/auth/me').set('Cookie', cookie);

describe('forgot password', () => {
  test('same reply for unknown and known emails; mail only for the real account; link stored hashed', async () => {
    const email = await makeUser();
    const before = mail.resets;

    const unknown = await post('/auth/forgot-password', { email: `nobody${Date.now()}${DOMAIN}` });
    expect(mail.resets).toBe(before);
    const known = await post('/auth/forgot-password', { email });
    expect(known.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(mail.resets).toBe(before + 1);
    expect(mail.resetToken).toHaveLength(64);

    const row = await prisma.passwordResetToken.findFirst({ where: { user: { email } } });
    expect(row!.tokenHash).not.toBe(mail.resetToken);
    expect(Math.abs(row!.expiresAt.getTime() - (Date.now() + 60 * 60 * 1000))).toBeLessThan(60_000);
  });

  test('respects the 60 second cooldown, then a new link replaces the old one', async () => {
    const email = await makeUser();
    await post('/auth/forgot-password', { email });
    const first = mail.resetToken;
    const count = mail.resets;

    await post('/auth/forgot-password', { email }); // too soon
    expect(mail.resets).toBe(count);

    await prisma.passwordResetToken.updateMany({
      where: { user: { email } },
      data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) },
    });
    await post('/auth/forgot-password', { email });
    expect(mail.resets).toBe(count + 1);
    expect(mail.resetToken).not.toBe(first);
    expect((await post('/auth/reset-password', { token: first, newPassword: NEW })).status).toBe(400);
  });

  test('a disabled account gets no email', async () => {
    const email = await makeUser();
    await prisma.user.update({ where: { email }, data: { isActive: false } });
    const before = mail.resets;
    expect((await post('/auth/forgot-password', { email })).status).toBe(200);
    expect(mail.resets).toBe(before);
  });
});

describe('reset password', () => {
  test('sets the new password, signs out every session, works once, and sends a notice', async () => {
    const email = await makeUser();
    const { cookie } = await login(email, OLD);
    expect((await me(cookie)).status).toBe(200);

    await post('/auth/forgot-password', { email });
    const token = mail.resetToken;
    const changedBefore = mail.changed;

    const res = await post('/auth/reset-password', { token, newPassword: NEW });
    expect(res.status).toBe(200);
    expect(mail.changed).toBe(changedBefore + 1);

    expect((await me(cookie)).status).toBe(401); // old session is gone
    expect((await login(email, OLD)).res.status).toBe(401);
    expect((await login(email, NEW)).res.status).toBe(200);

    const reuse = await post('/auth/reset-password', { token, newPassword: 'An0ther!Passw0rd' });
    expect(reuse.status).toBe(400);
    expect(reuse.body.code).toBe('INVALID_TOKEN');
  });

  test('a weak password is refused and the link stays usable', async () => {
    const email = await makeUser();
    await post('/auth/forgot-password', { email });
    const token = mail.resetToken;

    const weak = await post('/auth/reset-password', { token, newPassword: 'password' });
    expect(weak.status).toBe(400);
    expect(weak.body.code).toBe('VALIDATION_ERROR');
    expect((await post('/auth/reset-password', { token, newPassword: NEW })).status).toBe(200);
  });

  test('made-up and expired links are refused', async () => {
    expect((await post('/auth/reset-password', { token: 'a'.repeat(64), newPassword: NEW })).status).toBe(400);

    const email = await makeUser();
    await post('/auth/forgot-password', { email });
    const token = mail.resetToken;
    await prisma.passwordResetToken.updateMany({
      where: { user: { email } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await post('/auth/reset-password', { token, newPassword: NEW })).status).toBe(400);
  });

  test('resetting also verifies the email of an unverified account', async () => {
    const email = await makeUser(false);
    expect((await login(email, OLD)).res.status).toBe(403);

    await post('/auth/forgot-password', { email });
    expect((await post('/auth/reset-password', { token: mail.resetToken, newPassword: NEW })).status).toBe(200);
    expect((await login(email, NEW)).res.status).toBe(200);
  });
});

describe('change password (signed in)', () => {
  test('needs a session', async () => {
    const res = await post('/auth/change-password', { currentPassword: OLD, newPassword: NEW });
    expect(res.status).toBe(401);
  });

  test('refuses a wrong current password, a weak new one, and an unchanged one', async () => {
    const email = await makeUser();
    const { cookie } = await login(email, OLD);

    const wrong = await post('/auth/change-password', { currentPassword: 'Wrong!Pass123', newPassword: NEW }, cookie);
    expect(wrong.status).toBe(401);
    expect((await post('/auth/change-password', { currentPassword: OLD, newPassword: 'weak' }, cookie)).status).toBe(400);
    expect((await post('/auth/change-password', { currentPassword: OLD, newPassword: OLD }, cookie)).status).toBe(400);
    expect((await login(email, OLD)).res.status).toBe(200); // nothing changed
  });

  test('changes the password, keeps this session, signs out the others, and sends a notice', async () => {
    const email = await makeUser();
    const first = await login(email, OLD);
    const second = await login(email, OLD);
    const changedBefore = mail.changed;

    const res = await post('/auth/change-password', { currentPassword: OLD, newPassword: NEW }, first.cookie);
    expect(res.status).toBe(200);
    expect(mail.changed).toBe(changedBefore + 1);

    expect((await me(first.cookie)).status).toBe(200); // this device stays signed in
    expect((await me(second.cookie)).status).toBe(401); // other device is signed out
    expect((await login(email, OLD)).res.status).toBe(401);
    expect((await login(email, NEW)).res.status).toBe(200);

    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(stored.passwordHash).not.toContain(NEW);
  });

  test('rejects unknown fields (strict schema)', async () => {
    const email = await makeUser();
    const { cookie } = await login(email, OLD);
    const res = await post('/auth/change-password', { currentPassword: OLD, newPassword: NEW, role: 'HOD' }, cookie);
    expect(res.status).toBe(400);
  });
});
