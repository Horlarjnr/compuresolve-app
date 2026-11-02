import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

// Capture the emailed invitation instead of printing it.
const mail = vi.hoisted(() => ({ lastToken: '', lastLabel: '', lastTo: '', sent: 0 }));
vi.mock('../../src/services/mail.service', () => ({
  sendVerificationEmail: vi.fn(),
  sendStaffInvitationEmail: vi.fn(async (to: string, label: string, token: string) => {
    mail.lastTo = to;
    mail.lastLabel = label;
    mail.lastToken = token;
    mail.sent += 1;
  }),
}));

import app from '../../src/app';
import { hashPassword } from '../../src/utils/password';
import { prisma } from '../../src/utils/prisma';

const PASSWORD = 'Str0ng!Pass#';
const DOMAIN = '@invite.invalid';
const CODES = ['INVA', 'INVB'];
const ADMIN = `admin${DOMAIN}`;
const HOD_A = `hoda${DOMAIN}`;
const HOD_B = `hodb${DOMAIN}`;
const OFFICER_A = `officera${DOMAIN}`;
const STUDENT = `student${DOMAIN}`;

let deptA = '';
let deptB = '';
let seq = 0;
const cookies: Record<string, string> = {};

const cleanup = async () => {
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actor: { email: { endsWith: DOMAIN } } }, { department: { code: { in: CODES } } }] },
  });
  await prisma.staffInvitation.deleteMany({
    where: { OR: [{ email: { endsWith: DOMAIN } }, { invitedBy: { email: { endsWith: DOMAIN } } }] },
  });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
};

const login = async (email: string) => {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  const raw = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('sid='))!;
  return raw.split(';')[0];
};

beforeAll(async () => {
  await cleanup();
  const a = await prisma.department.upsert({
    where: { name: 'Invite Test Dept A' },
    update: { isActive: true },
    create: { name: 'Invite Test Dept A', code: 'INVA' },
  });
  const b = await prisma.department.upsert({
    where: { name: 'Invite Test Dept B' },
    update: { isActive: true },
    create: { name: 'Invite Test Dept B', code: 'INVB' },
  });
  deptA = a.id;
  deptB = b.id;

  const passwordHash = await hashPassword(PASSWORD);
  const base = { passwordHash, emailVerifiedAt: new Date() };
  await prisma.user.create({
    data: { ...base, fullName: 'Admin', email: ADMIN, facultyRoles: { create: { role: 'FACULTY_ADMIN' } } },
  });
  await prisma.user.create({
    data: { ...base, fullName: 'Hod A', email: HOD_A, memberships: { create: { departmentId: deptA, role: 'HOD' } } },
  });
  await prisma.user.create({
    data: { ...base, fullName: 'Hod B', email: HOD_B, memberships: { create: { departmentId: deptB, role: 'HOD' } } },
  });
  await prisma.user.create({
    data: {
      ...base,
      fullName: 'Officer A',
      email: OFFICER_A,
      memberships: { create: { departmentId: deptA, role: 'OFFICER' } },
    },
  });
  await prisma.user.create({
    data: {
      ...base,
      fullName: 'Student',
      email: STUDENT,
      matricNumber: 'INV/1234/001',
      studentProfile: { create: { level: 'L200' } },
      memberships: { create: { departmentId: deptA, role: 'STUDENT' } },
    },
  });

  for (const email of [ADMIN, HOD_A, HOD_B, OFFICER_A, STUDENT]) {
    cookies[email] = await login(email);
  }
}, 300_000);

afterAll(async () => {
  await cleanup();
  await prisma.department.deleteMany({ where: { code: { in: CODES } } });
  await prisma.$disconnect();
});

const newEmail = () => `inv${Date.now()}x${++seq}${DOMAIN}`;
const invite = (who: string, body: object) =>
  request(app).post('/api/v1/invitations').set('Cookie', cookies[who]).send(body);
const list = (who: string) => request(app).get('/api/v1/invitations').set('Cookie', cookies[who]);
const revoke = (who: string, id: string) =>
  request(app).delete(`/api/v1/invitations/${id}`).set('Cookie', cookies[who]);
const accept = (body: object) => request(app).post('/api/v1/invitations/accept').send(body);

describe('who may use the invitation endpoints', () => {
  test('signed-out users get 401', async () => {
    expect((await request(app).post('/api/v1/invitations').send({})).status).toBe(401);
    expect((await request(app).get('/api/v1/invitations')).status).toBe(401);
    expect((await request(app).delete(`/api/v1/invitations/${deptA}`)).status).toBe(401);
  });

  test('students and officers get 403', async () => {
    const body = { email: newEmail(), role: 'OFFICER', departmentId: deptA };
    expect((await invite(STUDENT, body)).status).toBe(403);
    expect((await invite(OFFICER_A, body)).status).toBe(403);
    expect((await list(STUDENT)).status).toBe(403);
    expect((await list(OFFICER_A)).status).toBe(403);
  });
});

describe('creating invitations', () => {
  test('HOD invites an Officer in their own department: token emailed, only a hash stored, audit written', async () => {
    const email = newEmail();
    const res = await invite(HOD_A, { email, role: 'OFFICER', departmentId: deptA });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email, role: 'OFFICER', status: 'PENDING' });
    expect(res.body.data.department.id).toBe(deptA);
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);

    expect(mail.lastTo).toBe(email);
    expect(mail.lastLabel).toContain('Officer');
    expect(mail.lastToken).toHaveLength(64);

    const row = await prisma.staffInvitation.findUnique({ where: { id: res.body.data.id } });
    expect(row!.tokenHash).not.toBe(mail.lastToken);
    expect(row!.invitedById).toBeTruthy();
    expect(Math.abs(row!.expiresAt.getTime() - (Date.now() + 7 * 24 * 60 * 60 * 1000))).toBeLessThan(60_000);

    const audit = await prisma.auditLog.findFirst({ where: { entityId: res.body.data.id } });
    expect(audit!.action).toBe('invitation.created');
    expect(JSON.stringify(audit!.metadata)).not.toContain(mail.lastToken);
  });

  test('HOD cannot invite an HOD, a Faculty Admin, or an Officer in another department', async () => {
    const before = await prisma.staffInvitation.count();
    expect((await invite(HOD_A, { email: newEmail(), role: 'HOD', departmentId: deptA })).status).toBe(403);
    expect((await invite(HOD_A, { email: newEmail(), role: 'FACULTY_ADMIN' })).status).toBe(403);
    expect((await invite(HOD_A, { email: newEmail(), role: 'OFFICER', departmentId: deptB })).status).toBe(403);
    expect(await prisma.staffInvitation.count()).toBe(before);
  });

  test('Faculty Admin invites an Officer, an HOD and another Faculty Admin', async () => {
    expect((await invite(ADMIN, { email: newEmail(), role: 'OFFICER', departmentId: deptB })).status).toBe(201);
    expect((await invite(ADMIN, { email: newEmail(), role: 'HOD', departmentId: deptB })).status).toBe(201);
    const fa = await invite(ADMIN, { email: newEmail(), role: 'FACULTY_ADMIN' });
    expect(fa.status).toBe(201);
    expect(fa.body.data.role).toBe('FACULTY_ADMIN');
    expect(fa.body.data.department).toBeNull();
  });

  test.each([
    ['a Faculty Admin invitation with a department', { role: 'FACULTY_ADMIN' }, true],
    ['an Officer invitation without a department', { role: 'OFFICER' }, false],
    ['a made-up role', { role: 'STUDENT', departmentId: 'x' }, true],
    ['extra fields like status', { role: 'OFFICER', status: 'ACCEPTED' }, true],
  ])('rejects %s', async (_label, extra, withDept) => {
    const body: Record<string, unknown> = { email: newEmail(), ...extra };
    if (withDept && !('departmentId' in body)) body.departmentId = deptA;
    const res = await invite(ADMIN, body);
    expect(res.status).toBe(400);
  });

  test('rejects an unknown department and an invalid email', async () => {
    const unknown = await invite(ADMIN, {
      email: newEmail(),
      role: 'OFFICER',
      departmentId: '00000000-0000-4000-8000-000000000000',
    });
    expect(unknown.body.code).toBe('INVALID_DEPARTMENT');
    expect((await invite(ADMIN, { email: 'nope', role: 'OFFICER', departmentId: deptA })).status).toBe(400);
  });

  test('rejects duplicates, student emails and people who already hold the role', async () => {
    const email = newEmail();
    expect((await invite(HOD_A, { email, role: 'OFFICER', departmentId: deptA })).status).toBe(201);
    const dup = await invite(HOD_A, { email, role: 'OFFICER', departmentId: deptA });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('DUPLICATE_INVITATION');

    const student = await invite(HOD_A, { email: STUDENT, role: 'OFFICER', departmentId: deptA });
    expect(student.body.code).toBe('STUDENT_ACCOUNT');

    const holder = await invite(HOD_A, { email: OFFICER_A, role: 'OFFICER', departmentId: deptA });
    expect(holder.body.code).toBe('ALREADY_HAS_ROLE');
  });
});

describe('listing and revoking are limited to your scope', () => {
  test('HOD B cannot see or revoke department A invitations; HOD A and the admin can', async () => {
    const created = await invite(HOD_A, { email: newEmail(), role: 'OFFICER', departmentId: deptA });
    const id = created.body.data.id as string;

    const asB = await list(HOD_B);
    expect(asB.status).toBe(200);
    expect(asB.body.data.map((i: { id: string }) => i.id)).not.toContain(id);
    expect((await revoke(HOD_B, id)).status).toBe(404);

    const asA = await list(HOD_A);
    expect(asA.body.data.map((i: { id: string }) => i.id)).toContain(id);

    const asAdmin = await list(ADMIN);
    expect(asAdmin.body.data.map((i: { id: string }) => i.id)).toContain(id);
    expect(JSON.stringify(asAdmin.body)).not.toMatch(/tokenHash/);
  });

  test('HOD A sees only Officer invitations for their own department', async () => {
    await invite(ADMIN, { email: newEmail(), role: 'HOD', departmentId: deptA });
    const asA = await list(HOD_A);
    for (const item of asA.body.data) {
      expect(item.role).toBe('OFFICER');
      expect(item.department.id).toBe(deptA);
    }
  });

  test('revoking works once; a revoked invitation cannot be accepted', async () => {
    const email = newEmail();
    const created = await invite(HOD_A, { email, role: 'OFFICER', departmentId: deptA });
    const token = mail.lastToken;
    const id = created.body.data.id as string;

    expect((await revoke(HOD_A, id)).status).toBe(204);
    const again = await revoke(HOD_A, id);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('INVITATION_CLOSED');

    const tryAccept = await accept({ token, fullName: 'Late Officer', password: PASSWORD });
    expect(tryAccept.status).toBe(400);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });
});

describe('accepting an invitation', () => {
  test('a new Officer is created verified, with only the invited role, and can log in', async () => {
    const email = newEmail();
    await invite(HOD_A, { email, role: 'OFFICER', departmentId: deptA });
    const token = mail.lastToken;

    const res = await accept({ token, fullName: 'New Officer', password: PASSWORD });
    expect(res.status).toBe(201);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { memberships: true, facultyRoles: true, studentProfile: true },
    });
    expect(user!.emailVerifiedAt).not.toBeNull();
    expect(user!.passwordHash).not.toBe(PASSWORD);
    expect(user!.matricNumber).toBeNull();
    expect(user!.studentProfile).toBeNull();
    expect(user!.facultyRoles).toHaveLength(0);
    expect(user!.memberships).toHaveLength(1);
    expect(user!.memberships[0]).toMatchObject({ role: 'OFFICER', status: 'ACTIVE', departmentId: deptA });

    expect(await prisma.roleGrantRequest.count({ where: { userId: user!.id, status: 'ACTIVE' } })).toBe(1);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'invitation.accepted', actorId: user!.id } });
    expect(audit).not.toBeNull();

    const reuse = await accept({ token, fullName: 'Someone Else', password: PASSWORD });
    expect(reuse.status).toBe(400);

    const loggedIn = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    expect(loggedIn.status).toBe(200);
    expect(loggedIn.body.data.roles).toEqual(['OFFICER']);

    // A new Officer still cannot invite anybody.
    const cookie = (loggedIn.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    const tryInvite = await request(app)
      .post('/api/v1/invitations')
      .set('Cookie', cookie)
      .send({ email: newEmail(), role: 'OFFICER', departmentId: deptA });
    expect(tryInvite.status).toBe(403);
  });

  test('a new account needs a full name and a strong password', async () => {
    await invite(HOD_A, { email: newEmail(), role: 'OFFICER', departmentId: deptA });
    const token = mail.lastToken;
    expect((await accept({ token, password: PASSWORD })).status).toBe(400);
    expect((await accept({ token, fullName: 'Weak Pass', password: 'password' })).status).toBe(400);
    expect((await accept({ token, fullName: 'Ok Name', password: PASSWORD, role: 'HOD' })).status).toBe(400);
  });

  test('a made-up or expired token is refused', async () => {
    expect((await accept({ token: 'a'.repeat(64), fullName: 'Nobody', password: PASSWORD })).status).toBe(400);

    const created = await invite(HOD_A, { email: newEmail(), role: 'OFFICER', departmentId: deptA });
    const token = mail.lastToken;
    await prisma.staffInvitation.update({
      where: { id: created.body.data.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await accept({ token, fullName: 'Too Late', password: PASSWORD })).status).toBe(400);
  });

  test('an invited Faculty Admin gets faculty access and can then invite', async () => {
    const email = newEmail();
    await invite(ADMIN, { email, role: 'FACULTY_ADMIN' });
    const token = mail.lastToken;
    expect((await accept({ token, fullName: 'Second Admin', password: PASSWORD })).status).toBe(201);

    const loggedIn = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    expect(loggedIn.body.data.roles).toEqual(['FACULTY_ADMIN']);
    const cookie = (loggedIn.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    const listed = await request(app).get('/api/v1/invitations').set('Cookie', cookie);
    expect(listed.status).toBe(200);
  });

  test('an existing staff account must prove ownership with its current password', async () => {
    const created = await invite(ADMIN, { email: OFFICER_A, role: 'OFFICER', departmentId: deptB });
    expect(created.status).toBe(201);
    const token = mail.lastToken;

    const wrong = await accept({ token, password: 'Wrong!Pass123' });
    expect(wrong.status).toBe(401);
    expect(await prisma.departmentMembership.count({ where: { user: { email: OFFICER_A } } })).toBe(1);

    const right = await accept({ token, password: PASSWORD });
    expect(right.status).toBe(201);
    expect(await prisma.departmentMembership.count({ where: { user: { email: OFFICER_A } } })).toBe(2);
  });
});
