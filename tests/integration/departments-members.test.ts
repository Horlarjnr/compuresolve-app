import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

vi.mock('../../src/services/mail.service', () => ({
  sendVerificationEmail: vi.fn(),
  sendStaffInvitationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendPasswordChangedEmail: vi.fn(),
}));

import app from '../../src/app';
import { hashPassword } from '../../src/utils/password';
import { prisma } from '../../src/utils/prisma';

const PASSWORD = 'Str0ng!Pass#';
const DOMAIN = '@mem.invalid';
const CODES = ['MMA', 'MMB', 'MMX'];
const e = (name: string) => `${name}${DOMAIN}`;

let deptA = '';
let deptB = '';
const cookies: Record<string, string> = {};
const membershipIds: Record<string, string> = {};

const cleanup = async () => {
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actor: { email: { endsWith: DOMAIN } } }, { department: { code: { in: CODES } } }] },
  });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.department.deleteMany({ where: { code: { in: CODES } } });
};

const login = async (name: string) => {
  const res = await request(app).post('/api/v1/auth/login').send({ email: e(name), password: PASSWORD });
  const raw = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('sid='))!;
  return raw.split(';')[0];
};

const api = {
  get: (who: string, path: string) => request(app).get(`/api/v1${path}`).set('Cookie', cookies[who] ?? ''),
  post: (who: string, path: string, body: object = {}) =>
    request(app).post(`/api/v1${path}`).set('Cookie', cookies[who] ?? '').send(body),
};

const me = (who: string) => request(app).get('/api/v1/auth/me').set('Cookie', cookies[who]);

beforeAll(async () => {
  await cleanup();
  const passwordHash = await hashPassword(PASSWORD);
  const make = (name: string, extra: Record<string, unknown> = {}) =>
    prisma.user.create({ data: { fullName: name, email: e(name), passwordHash, emailVerifiedAt: new Date(), ...extra } });

  await make('admin', { facultyRoles: { create: { role: 'FACULTY_ADMIN' } } });
  cookies.admin = await login('admin');

  // Departments are created through the real endpoint.
  const a = await api.post('admin', '/departments', { name: 'Mem Test Dept A', code: 'MMA' });
  const b = await api.post('admin', '/departments', { name: 'Mem Test Dept B', code: 'MMB' });
  deptA = a.body.data.id;
  deptB = b.body.data.id;

  const withRole = (departmentId: string, role: string) => ({ memberships: { create: { departmentId, role } } });
  await make('hoda', withRole(deptA, 'HOD'));
  await make('officera', withRole(deptA, 'OFFICER'));
  await make('officera2', withRole(deptA, 'OFFICER'));
  await make('hodb', withRole(deptB, 'HOD'));
  await make('officerb', withRole(deptB, 'OFFICER'));
  await make('studenta', {
    matricNumber: 'MEM/1234/001',
    studentProfile: { create: { level: 'L100' } },
    ...withRole(deptA, 'STUDENT'),
  });

  for (const name of ['hoda', 'officera', 'officera2', 'hodb', 'officerb', 'studenta']) {
    cookies[name] = await login(name);
    const m = await prisma.departmentMembership.findFirstOrThrow({ where: { user: { email: e(name) } } });
    membershipIds[name] = m.id;
  }
}, 300_000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('department management (Faculty Admin only)', () => {
  test('signed-out, HOD, Officer and student cannot create a department', async () => {
    const body = { name: 'Nope Department', code: 'NOPE' };
    expect((await request(app).post('/api/v1/departments').send(body)).status).toBe(401);
    for (const who of ['hoda', 'officera', 'studenta']) {
      expect((await api.post(who, '/departments', body)).status).toBe(403);
    }
    expect(await prisma.department.count({ where: { code: 'NOPE' } })).toBe(0);
  });

  test('the Faculty Admin creates a department; it is audited; duplicates and bad input are refused', async () => {
    const res = await api.post('admin', '/departments', { name: 'Mem Test Dept X', code: 'mmx' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: 'Mem Test Dept X', code: 'MMX', isActive: true });

    const audit = await prisma.auditLog.findFirst({ where: { entityId: res.body.data.id } });
    expect(audit!.action).toBe('department.created');

    const sameName = await api.post('admin', '/departments', { name: 'MEM TEST DEPT X', code: 'MMY' });
    expect(sameName.status).toBe(409);
    const sameCode = await api.post('admin', '/departments', { name: 'Another Name Entirely', code: 'MMX' });
    expect(sameCode.status).toBe(409);
    expect((await api.post('admin', '/departments', { name: 'Bad Code Dept', code: 'no way!' })).status).toBe(400);
    expect((await api.post('admin', '/departments', { name: 'Extra Field Dept', code: 'EFD', isActive: false })).status).toBe(400);
  });

  test('deactivating hides a department from registration; reactivating brings it back', async () => {
    const created = await prisma.department.findUniqueOrThrow({ where: { name: 'Mem Test Dept X' } });
    const ids = async () => (await request(app).get('/api/v1/departments')).body.data.map((d: { id: string }) => d.id);

    expect(await ids()).toContain(created.id);
    expect((await api.post('admin', `/departments/${created.id}/deactivate`)).status).toBe(200);
    expect(await ids()).not.toContain(created.id);

    const all = await api.get('admin', '/departments/all');
    expect(all.body.data.find((d: { id: string }) => d.id === created.id).isActive).toBe(false);

    const again = await api.post('admin', `/departments/${created.id}/deactivate`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('NO_CHANGE');

    expect((await api.post('admin', `/departments/${created.id}/reactivate`)).status).toBe(200);
    expect(await ids()).toContain(created.id);
  });

  test('only the Faculty Admin may deactivate, and unknown ids give 404', async () => {
    expect((await api.post('hoda', `/departments/${deptA}/deactivate`)).status).toBe(403);
    expect((await api.get('hoda', '/departments/all')).status).toBe(403);
    const unknown = await api.post('admin', '/departments/00000000-0000-4000-8000-000000000000/deactivate');
    expect(unknown.status).toBe(404);
  });
});

describe('listing department staff', () => {
  test('a HOD sees their own department staff only: no students, no password data', async () => {
    const res = await api.get('hoda', `/departments/${deptA}/members`);
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 20, total: 3 });
    const emails = res.body.data.map((m: { user: { email: string } }) => m.user.email).sort();
    expect(emails).toEqual([e('hoda'), e('officera'), e('officera2')].sort());
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|studenta/i);
  });

  test('paging works', async () => {
    const res = await api.get('hoda', `/departments/${deptA}/members?page=2&limit=2`);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ page: 2, limit: 2, total: 3 });
    expect((await api.get('hoda', `/departments/${deptA}/members?limit=1000`)).status).toBe(400);
  });

  test("a HOD asking about another department gets the same 404 as a department that does not exist", async () => {
    const other = await api.get('hoda', `/departments/${deptB}/members`);
    const missing = await api.get('hoda', '/departments/00000000-0000-4000-8000-000000000000/members');
    expect(other.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(other.body.message).toBe(missing.body.message);
  });

  test('Officers and students are refused; the Faculty Admin may look at any department', async () => {
    expect((await api.get('officera', `/departments/${deptA}/members`)).status).toBe(403);
    expect((await api.get('studenta', `/departments/${deptA}/members`)).status).toBe(403);
    expect((await request(app).get(`/api/v1/departments/${deptA}/members`)).status).toBe(401);
    expect((await api.get('admin', `/departments/${deptB}/members`)).status).toBe(200);
  });
});

describe('suspending and reactivating staff', () => {
  test('a HOD suspends an Officer in their department: effect is immediate, audited, and reversible', async () => {
    const path = `/departments/${deptA}/members/${membershipIds.officera}`;
    expect((await me('officera')).body.data.roles).toContain('OFFICER');

    const res = await api.post('hoda', `${path}/suspend`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUSPENDED');
    expect((await me('officera')).body.data.roles).not.toContain('OFFICER'); // same session, role already gone

    const audit = await prisma.auditLog.findFirst({ where: { entityId: membershipIds.officera, action: 'membership.suspended' } });
    expect(audit).not.toBeNull();

    const again = await api.post('hoda', `${path}/suspend`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('NO_CHANGE');

    expect((await api.post('hoda', `${path}/reactivate`)).status).toBe(200);
    expect((await me('officera')).body.data.roles).toContain('OFFICER');
  });

  test("a HOD cannot touch another department's staff, even by mixing up the ids in the URL", async () => {
    // right department in the URL, but a membership that belongs to department B
    const mixed = await api.post('hoda', `/departments/${deptA}/members/${membershipIds.officerb}/suspend`);
    expect(mixed.status).toBe(404);
    // department B in the URL
    const direct = await api.post('hoda', `/departments/${deptB}/members/${membershipIds.officerb}/suspend`);
    expect(direct.status).toBe(404);
    expect((await me('officerb')).body.data.roles).toContain('OFFICER');
  });

  test('a HOD cannot suspend a student membership or another HOD', async () => {
    expect((await api.post('hoda', `/departments/${deptA}/members/${membershipIds.studenta}/suspend`)).status).toBe(404);
    expect((await api.post('hodb', `/departments/${deptB}/members/${membershipIds.hodb}/suspend`)).status).toBe(404); // not even themselves
  });

  test('Officers and students cannot suspend anyone', async () => {
    const path = `/departments/${deptA}/members/${membershipIds.officera2}/suspend`;
    expect((await api.post('officera', path)).status).toBe(403);
    expect((await api.post('studenta', path)).status).toBe(403);
  });

  test('the Faculty Admin suspends a HOD; the HOD loses HOD powers straight away', async () => {
    const path = `/departments/${deptB}/members/${membershipIds.hodb}`;
    expect((await api.post('admin', `${path}/suspend`)).status).toBe(200);
    expect((await me('hodb')).body.data.roles).not.toContain('HOD');
    expect((await api.get('hodb', `/departments/${deptB}/members`)).status).toBe(403);
  });

  test('a suspended HOD cannot be reactivated while another HOD is active in that department', async () => {
    // department B's HOD is suspended from the previous test; a replacement takes the seat
    const replacement = await prisma.user.create({
      data: {
        fullName: 'Replacement Hod',
        email: e('hodb2'),
        passwordHash: await hashPassword(PASSWORD),
        emailVerifiedAt: new Date(),
        memberships: { create: { departmentId: deptB, role: 'HOD', status: 'ACTIVE' } },
      },
    });
    expect(replacement.id).toBeTruthy();

    const res = await api.post('admin', `/departments/${deptB}/members/${membershipIds.hodb}/reactivate`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('HOD_EXISTS');
  });
});
