import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

// Capture the emailed token instead of printing it.
const mail = vi.hoisted(() => ({ lastToken: '', sent: 0 }));
vi.mock('../../src/services/mail.service', () => ({
  sendVerificationEmail: vi.fn(async (_to: string, _name: string, token: string) => {
    mail.lastToken = token;
    mail.sent += 1;
  }),
  sendStaffInvitationEmail: vi.fn(),
}));

import app from '../../src/app';
import { prisma } from '../../src/utils/prisma';

const PASSWORD = 'Str0ng!Pass#';
const DOMAIN = '@test.invalid';
let deptId = '';
let inactiveDeptId = '';
let seq = 0;

const cleanup = () => prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });

beforeAll(async () => {
  await cleanup();
  const dept = await prisma.department.upsert({
    where: { name: 'Test Department (integration)' },
    update: { isActive: true },
    create: { name: 'Test Department (integration)', code: 'TSTDEPT' },
  });
  const inactive = await prisma.department.upsert({
    where: { name: 'Test Inactive Department' },
    update: { isActive: false },
    create: { name: 'Test Inactive Department', code: 'TSTINACT', isActive: false },
  });
  deptId = dept.id;
  inactiveDeptId = inactive.id;
});

afterAll(async () => {
  await cleanup();
  await prisma.department.deleteMany({ where: { code: { in: ['TSTDEPT', 'TSTINACT'] } } });
  await prisma.$disconnect();
});

const newStudent = (overrides: Record<string, unknown> = {}) => {
  seq += 1;
  return {
    fullName: 'Test Student',
    email: `t${Date.now()}x${seq}${DOMAIN}`,
    password: PASSWORD,
    matricNumber: `TST/${1000 + Math.floor(Math.random() * 9000)}/${String(seq).padStart(3, '0')}`,
    departmentId: deptId,
    level: 200,
    ...overrides,
  };
};

const post = (path: string, body: object) => request(app).post(`/api/v1${path}`).send(body);

const registerStudent = async (overrides: Record<string, unknown> = {}) => {
  const body = newStudent(overrides);
  const res = await post('/auth/register', body);
  return { body, res, token: mail.lastToken };
};

const verifiedStudent = async () => {
  const { body, token } = await registerStudent();
  await post('/auth/verify-email', { token });
  return body;
};

const loginAs = (b: { email: string; password: string }) => post('/auth/login', { email: b.email, password: b.password });

const sidCookie = (res: request.Response) => {
  const cookies = res.headers['set-cookie'] as unknown as string[];
  return cookies.find((c) => c.startsWith('sid='))!;
};
const cookieHeader = (res: request.Response) => sidCookie(res).split(';')[0];

describe('GET /departments', () => {
  test('lists active departments only, with harmless fields', async () => {
    const res = await request(app).get('/api/v1/departments');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((d: { id: string }) => d.id);
    expect(ids).toContain(deptId);
    expect(ids).not.toContain(inactiveDeptId);
    expect(Object.keys(res.body.data[0]).sort()).toEqual(['code', 'id', 'name']);
  });
});

describe('POST /auth/register', () => {
  test('creates an unverified student with profile, STUDENT membership and a hashed token', async () => {
    const { body, res, token } = await registerStudent({
      email: `Mixed.Case${Date.now()}${DOMAIN}`,
      matricNumber: `tst/${1000 + Math.floor(Math.random() * 9000)}/${String(++seq).padStart(3, '0')}`,
    });
    expect(res.status).toBe(201);
    expect(Object.keys(res.body.data).sort()).toEqual(['email', 'fullName', 'id']);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);

    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
      include: { studentProfile: true, memberships: true, emailVerificationTokens: true, facultyRoles: true },
    });
    expect(user).not.toBeNull();
    expect(user!.passwordHash).not.toBe(PASSWORD);
    expect(user!.passwordHash.startsWith('$2')).toBe(true);
    expect(user!.emailVerifiedAt).toBeNull();
    expect(user!.matricNumber).toBe(user!.matricNumber!.toUpperCase());
    expect(user!.studentProfile?.level).toBe('L200');
    expect(user!.memberships).toHaveLength(1);
    expect(user!.memberships[0]).toMatchObject({ role: 'STUDENT', status: 'ACTIVE', departmentId: deptId });
    expect(user!.facultyRoles).toHaveLength(0);
    expect(user!.emailVerificationTokens[0].tokenHash).not.toBe(token); // only the hash is stored
    expect(token).toHaveLength(64);
  });

  test.each([
    ['a role field', { role: 'HOD' }],
    ['a department role field', { departmentRole: 'OFFICER' }],
    ['an isActive field', { isActive: true }],
    ['a facultyRole field', { facultyRole: 'FACULTY_ADMIN' }],
  ])('rejects %s (strict schema)', async (_label, extra) => {
    const res = await post('/auth/register', { ...newStudent(), ...extra });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test.each([
    ['a bad matric number', { matricNumber: 'ABC-1234-567' }],
    ['a weak password', { password: 'password' }],
    ['an invalid level', { level: 150 }],
    ['an invalid email', { email: 'not-an-email' }],
    ['a non-uuid department', { departmentId: 'abc' }],
  ])('rejects %s', async (_label, override) => {
    const res = await post('/auth/register', newStudent(override));
    expect(res.status).toBe(400);
  });

  test('rejects an unknown or inactive department', async () => {
    const unknown = await post('/auth/register', newStudent({ departmentId: '00000000-0000-4000-8000-000000000000' }));
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe('INVALID_DEPARTMENT');
    const inactive = await post('/auth/register', newStudent({ departmentId: inactiveDeptId }));
    expect(inactive.body.code).toBe('INVALID_DEPARTMENT');
  });

  test('rejects a duplicate email and a duplicate matric number with 409', async () => {
    const { body } = await registerStudent();
    const sameEmail = await post('/auth/register', newStudent({ email: body.email }));
    expect(sameEmail.status).toBe(409);
    const sameMatric = await post('/auth/register', newStudent({ matricNumber: body.matricNumber }));
    expect(sameMatric.status).toBe(409);
  });
});

describe('email verification', () => {
  test('login is blocked until the email is verified', async () => {
    const { body } = await registerStudent();
    const res = await loginAs(body);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('a token works once, then is refused', async () => {
    const { token } = await registerStudent();
    expect((await post('/auth/verify-email', { token })).status).toBe(200);
    const again = await post('/auth/verify-email', { token });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('INVALID_TOKEN');
  });

  test('a made-up token is refused', async () => {
    const res = await post('/auth/verify-email', { token: 'a'.repeat(64) });
    expect(res.status).toBe(400);
  });

  test('an expired token is refused', async () => {
    const { body, token } = await registerStudent();
    await prisma.emailVerificationToken.updateMany({
      where: { user: { email: body.email } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await post('/auth/verify-email', { token })).status).toBe(400);
  });

  test('resend: same reply for unknown and verified emails, and no mail is sent for them', async () => {
    const verified = await verifiedStudent();
    const before = mail.sent;
    const unknown = await post('/auth/resend-verification', { email: `nobody${Date.now()}${DOMAIN}` });
    const known = await post('/auth/resend-verification', { email: verified.email });
    expect(unknown.status).toBe(200);
    expect(known.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(mail.sent).toBe(before);
  });

  test('resend: respects the 60 second cooldown, then issues a new link and kills the old one', async () => {
    const { body, token: oldToken } = await registerStudent();

    const before = mail.sent;
    await post('/auth/resend-verification', { email: body.email }); // too soon
    expect(mail.sent).toBe(before);

    await prisma.emailVerificationToken.updateMany({
      where: { user: { email: body.email } },
      data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) },
    });
    await post('/auth/resend-verification', { email: body.email });
    expect(mail.sent).toBe(before + 1);
    const newToken = mail.lastToken;
    expect(newToken).not.toBe(oldToken);

    expect((await post('/auth/verify-email', { token: oldToken })).status).toBe(400);
    expect((await post('/auth/verify-email', { token: newToken })).status).toBe(200);
  });
});

describe('login, me and logout', () => {
  test('wrong password and unknown email give the same 401 message', async () => {
    const student = await verifiedStudent();
    const wrong = await loginAs({ email: student.email, password: 'Wrong!Pass123' });
    const unknown = await loginAs({ email: `nobody${Date.now()}${DOMAIN}`, password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  test('successful login sets an HttpOnly cookie and stores only a hash of it for 7 days', async () => {
    const student = await verifiedStudent();
    const res = await loginAs({ ...student, email: student.email.toUpperCase() }); // email is case-insensitive
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/i);
    expect(res.body.data.roles).toEqual(['STUDENT']);

    const cookie = sidCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const rawToken = cookie.split(';')[0].replace('sid=', '');
    const session = await prisma.session.findFirst({ where: { user: { email: student.email } } });
    expect(session!.tokenHash).not.toBe(rawToken);
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(session!.expiresAt.getTime() - (Date.now() + sevenDays))).toBeLessThan(60_000);
  });

  test('GET /auth/me needs the cookie and returns the user with roles', async () => {
    const student = await verifiedStudent();
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);

    const login = await loginAs(student);
    const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookieHeader(login));
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(student.email);
    expect(me.body.data.roles).toEqual(['STUDENT']);
    expect(me.body.data.memberships[0].departmentId).toBe(deptId);
    expect(JSON.stringify(me.body)).not.toMatch(/passwordHash/i);
  });

  test('an expired session is refused', async () => {
    const student = await verifiedStudent();
    const login = await loginAs(student);
    await prisma.session.updateMany({
      where: { user: { email: student.email } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookieHeader(login))).status).toBe(401);
  });

  test('logout deletes the session and the cookie stops working', async () => {
    const student = await verifiedStudent();
    const login = await loginAs(student);
    const cookie = cookieHeader(login);

    const out = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(204);
    expect(await prisma.session.count({ where: { user: { email: student.email } } })).toBe(0);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  test('a deactivated account cannot log in, and an existing session stops working', async () => {
    const student = await verifiedStudent();
    const login = await loginAs(student);
    await prisma.user.update({ where: { email: student.email }, data: { isActive: false } });

    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookieHeader(login))).status).toBe(401);
    const again = await loginAs(student);
    expect(again.status).toBe(403);
    expect(again.body.code).toBe('ACCOUNT_DISABLED');
  });

  test('a student has no staff access: requireRole routes will refuse them', async () => {
    const student = await verifiedStudent();
    const login = await loginAs(student);
    const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookieHeader(login));
    expect(me.body.data.roles).not.toContain('HOD');
    expect(me.body.data.roles).not.toContain('OFFICER');
    expect(me.body.data.roles).not.toContain('FACULTY_ADMIN');
  });
});
