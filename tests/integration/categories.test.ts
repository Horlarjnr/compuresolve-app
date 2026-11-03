import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import app from '../../src/app';
import { hashPassword } from '../../src/utils/password';
import { prisma } from '../../src/utils/prisma';

const PASSWORD = 'Str0ng!Pass#';
const DOMAIN = '@cat.invalid';
const CODES = ['CTA', 'CTB'];
const e = (name: string) => `${name}${DOMAIN}`;

let deptA = '';
let deptB = '';
const cookies: Record<string, string> = {};

const cleanup = async () => {
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actor: { email: { endsWith: DOMAIN } } }, { department: { code: { in: CODES } } }] },
  });
  await prisma.complaintCategory.deleteMany({
    where: { OR: [{ department: { code: { in: CODES } } }, { name: { startsWith: 'CT ' } }] },
  });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
};

const login = async (name: string) => {
  const res = await request(app).post('/api/v1/auth/login').send({ email: e(name), password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('sid='))!.split(';')[0];
};

const get = (who: string, path: string) => request(app).get(`/api/v1${path}`).set('Cookie', cookies[who]);
const post = (who: string, path: string, body: object = {}) =>
  request(app).post(`/api/v1${path}`).set('Cookie', cookies[who]).send(body);
const names = (res: request.Response) => res.body.data.map((c: { name: string }) => c.name).sort();

beforeAll(async () => {
  await cleanup();
  const a = await prisma.department.upsert({
    where: { name: 'Category Test Dept A' },
    update: { isActive: true },
    create: { name: 'Category Test Dept A', code: 'CTA' },
  });
  const b = await prisma.department.upsert({
    where: { name: 'Category Test Dept B' },
    update: { isActive: true },
    create: { name: 'Category Test Dept B', code: 'CTB' },
  });
  deptA = a.id;
  deptB = b.id;

  const passwordHash = await hashPassword(PASSWORD);
  const make = (name: string, extra: Record<string, unknown>) =>
    prisma.user.create({ data: { fullName: name, email: e(name), passwordHash, emailVerifiedAt: new Date(), ...extra } });
  const role = (departmentId: string, r: string) => ({ memberships: { create: { departmentId, role: r } } });

  await make('admin', { facultyRoles: { create: { role: 'FACULTY_ADMIN' } } });
  await make('hoda', role(deptA, 'HOD'));
  await make('hodb', role(deptB, 'HOD'));
  await make('officera', role(deptA, 'OFFICER'));
  await make('studenta', role(deptA, 'STUDENT'));
  await make('studentb', role(deptB, 'STUDENT'));
  for (const n of ['admin', 'hoda', 'hodb', 'officera', 'studenta', 'studentb']) cookies[n] = await login(n);

  // fixtures straight in the database
  await prisma.complaintCategory.createMany({
    data: [
      { name: 'CT Dept A Cat', scope: 'DEPARTMENT', departmentId: deptA },
      { name: 'CT Dept A Old', scope: 'DEPARTMENT', departmentId: deptA, isActive: false },
      { name: 'CT Dept B Cat', scope: 'DEPARTMENT', departmentId: deptB },
      { name: 'CT Faculty Cat', scope: 'FACULTY' },
    ],
  });
}, 300_000);

afterAll(async () => {
  await cleanup();
  await prisma.department.deleteMany({ where: { code: { in: CODES } } });
  await prisma.$disconnect();
});

describe('listing categories', () => {
  test('a student sees their own department categories and faculty ones, never another department', async () => {
    const a = await get('studenta', '/categories');
    expect(a.status).toBe(200);
    const aNames = names(a).filter((n: string) => n.startsWith('CT '));
    expect(aNames).toEqual(['CT Dept A Cat', 'CT Faculty Cat']);

    const b = await get('studentb', '/categories');
    expect(names(b).filter((n: string) => n.startsWith('CT '))).toEqual(['CT Dept B Cat', 'CT Faculty Cat']);
  });

  test('inactive categories are hidden from students, even when they ask for them', async () => {
    const res = await get('studenta', '/categories?includeInactive=true');
    expect(names(res)).not.toContain('CT Dept A Old');
  });

  test('a HOD can include inactive categories of their own department only', async () => {
    const res = await get('hoda', '/categories?includeInactive=true');
    const list = names(res).filter((n: string) => n.startsWith('CT '));
    expect(list).toContain('CT Dept A Old');
    expect(list).not.toContain('CT Dept B Cat');
  });

  test('the Faculty Admin sees every category', async () => {
    const res = await get('admin', '/categories');
    const list = names(res).filter((n: string) => n.startsWith('CT '));
    expect(list).toEqual(['CT Dept A Cat', 'CT Dept B Cat', 'CT Faculty Cat']);
  });

  test('the filters narrow results and signed-out users get 401', async () => {
    const res = await get('admin', `/categories?departmentId=${deptB}`);
    expect(names(res)).toEqual(['CT Dept B Cat']);
    expect((await request(app).get('/api/v1/categories')).status).toBe(401);
    expect((await get('admin', '/categories?bogus=1')).status).toBe(400);
  });
});

describe('creating categories', () => {
  test('students and officers cannot create; signed-out users get 401', async () => {
    const body = { name: 'CT Nope', scope: 'DEPARTMENT', departmentId: deptA };
    expect((await post('studenta', '/categories', body)).status).toBe(403);
    expect((await post('officera', '/categories', body)).status).toBe(403);
    expect((await request(app).post('/api/v1/categories').send(body)).status).toBe(401);
  });

  test('a HOD creates a category in their own department only', async () => {
    const ok = await post('hoda', '/categories', { name: 'CT Hod Made', scope: 'DEPARTMENT', departmentId: deptA });
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ name: 'CT Hod Made', scope: 'DEPARTMENT', departmentId: deptA, isActive: true });
    expect(await prisma.auditLog.count({ where: { entityId: ok.body.data.id, action: 'category.created' } })).toBe(1);

    expect((await post('hoda', '/categories', { name: 'CT Other Dept', scope: 'DEPARTMENT', departmentId: deptB })).status).toBe(403);
    expect((await post('hoda', '/categories', { name: 'CT Faculty Try', scope: 'FACULTY' })).status).toBe(403);
  });

  test('the Faculty Admin creates faculty and department categories', async () => {
    expect((await post('admin', '/categories', { name: 'CT Admin Faculty', scope: 'FACULTY' })).status).toBe(201);
    expect((await post('admin', '/categories', { name: 'CT Admin Dept B', scope: 'DEPARTMENT', departmentId: deptB })).status).toBe(201);
  });

  test('duplicates (ignoring case) and bad input are refused', async () => {
    const dup = await post('hoda', '/categories', { name: 'ct dept a cat', scope: 'DEPARTMENT', departmentId: deptA });
    expect(dup.status).toBe(409);
    expect((await post('admin', '/categories', { name: 'CT Bad', scope: 'FACULTY', departmentId: deptA })).status).toBe(400);
    expect((await post('admin', '/categories', { name: 'CT Bad', scope: 'DEPARTMENT' })).status).toBe(400);
    expect((await post('admin', '/categories', { name: 'CT Bad', scope: 'FACULTY', isActive: false })).status).toBe(400);
    expect((await post('admin', '/categories', { name: 'x', scope: 'FACULTY' })).status).toBe(400);
  });
});

describe('deactivating categories', () => {
  test('a HOD deactivates and reactivates their own category; it disappears from student lists', async () => {
    const cat = await prisma.complaintCategory.findFirstOrThrow({ where: { name: 'CT Dept A Cat' } });
    expect((await post('hoda', `/categories/${cat.id}/deactivate`)).status).toBe(200);
    expect(names(await get('studenta', '/categories'))).not.toContain('CT Dept A Cat');

    const again = await post('hoda', `/categories/${cat.id}/deactivate`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('NO_CHANGE');

    expect((await post('hoda', `/categories/${cat.id}/reactivate`)).status).toBe(200);
    expect(names(await get('studenta', '/categories'))).toContain('CT Dept A Cat');
    expect(await prisma.auditLog.count({ where: { entityId: cat.id, action: 'category.deactivated' } })).toBe(1);
  });

  test("a HOD cannot touch another department's or the faculty's categories (404, not 403)", async () => {
    const other = await prisma.complaintCategory.findFirstOrThrow({ where: { name: 'CT Dept B Cat' } });
    const faculty = await prisma.complaintCategory.findFirstOrThrow({ where: { name: 'CT Faculty Cat' } });
    expect((await post('hoda', `/categories/${other.id}/deactivate`)).status).toBe(404);
    expect((await post('hoda', `/categories/${faculty.id}/deactivate`)).status).toBe(404);
    expect((await prisma.complaintCategory.findUniqueOrThrow({ where: { id: other.id } })).isActive).toBe(true);
  });

  test('students and officers cannot deactivate; the Faculty Admin can deactivate any', async () => {
    const cat = await prisma.complaintCategory.findFirstOrThrow({ where: { name: 'CT Dept B Cat' } });
    expect((await post('studentb', `/categories/${cat.id}/deactivate`)).status).toBe(403);
    expect((await post('officera', `/categories/${cat.id}/deactivate`)).status).toBe(403);
    expect((await post('admin', `/categories/${cat.id}/deactivate`)).status).toBe(200);
    expect((await post('admin', `/categories/${cat.id}/reactivate`)).status).toBe(200);
  });
});
