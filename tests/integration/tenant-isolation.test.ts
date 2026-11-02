import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { canViewComplaint, complaintScopeWhere } from '../../src/policies/complaint.policy';
import type { AuthUser } from '../../src/types/express';
import { hashPassword } from '../../src/utils/password';
import { prisma } from '../../src/utils/prisma';
import { publicUserSelect } from '../../src/utils/user-select';

// Cross-department isolation, proven against the real database.
// Complaint endpoints arrive in Phase 5; these tests lock the access rules in first.

const DOMAIN = '@tenant.invalid';
const CODES = ['TNA', 'TNB'];
const email = (name: string) => `${name}${DOMAIN}`;

let deptA = '';
let deptB = '';
const refs: Record<string, string> = {}; // label -> complaint id

const cleanup = async () => {
  await prisma.complaint.deleteMany({ where: { reference: { startsWith: 'TN-' } } });
  await prisma.complaintCategory.deleteMany({
    where: { OR: [{ department: { code: { in: CODES } } }, { name: 'TN Faculty Category' }] },
  });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
};

const loadUser = async (name: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { email: email(name) }, select: publicUserSelect })) as unknown as AuthUser;

const visibleLabels = async (name: string) => {
  const user = await loadUser(name);
  const rows = await prisma.complaint.findMany({ where: complaintScopeWhere(user), select: { id: true } });
  const ids = new Set(rows.map((r) => r.id));
  return Object.keys(refs).filter((label) => ids.has(refs[label])).sort();
};

beforeAll(async () => {
  await cleanup();
  const a = await prisma.department.upsert({
    where: { name: 'Tenant Test Dept A' },
    update: {},
    create: { name: 'Tenant Test Dept A', code: 'TNA' },
  });
  const b = await prisma.department.upsert({
    where: { name: 'Tenant Test Dept B' },
    update: {},
    create: { name: 'Tenant Test Dept B', code: 'TNB' },
  });
  deptA = a.id;
  deptB = b.id;

  const catA = await prisma.complaintCategory.create({ data: { name: 'TN Cat A', scope: 'DEPARTMENT', departmentId: deptA } });
  const catB = await prisma.complaintCategory.create({ data: { name: 'TN Cat B', scope: 'DEPARTMENT', departmentId: deptB } });
  const catF = await prisma.complaintCategory.create({ data: { name: 'TN Faculty Category', scope: 'FACULTY' } });

  const passwordHash = await hashPassword('Str0ng!Pass#');
  const make = (name: string, extra: Record<string, unknown> = {}) =>
    prisma.user.create({
      data: { fullName: name, email: email(name), passwordHash, emailVerifiedAt: new Date(), ...extra },
    });
  const membership = (departmentId: string, role: 'STUDENT' | 'OFFICER' | 'HOD') => ({
    memberships: { create: { departmentId, role } },
  });

  const sA1 = await make('studenta1', membership(deptA, 'STUDENT'));
  const sA2 = await make('studenta2', membership(deptA, 'STUDENT'));
  const sB = await make('studentb', membership(deptB, 'STUDENT'));
  await make('officera', membership(deptA, 'OFFICER'));
  await make('hoda', membership(deptA, 'HOD'));
  await make('officerb', membership(deptB, 'OFFICER'));
  await make('hodb', membership(deptB, 'HOD'));
  await make('admin', { facultyRoles: { create: { role: 'FACULTY_ADMIN' } } });
  await make('nobody');

  const create = async (label: string, data: Record<string, unknown>) => {
    const row = await prisma.complaint.create({
      data: { reference: `TN-${label}`, title: `Complaint ${label}`, description: 'Test complaint body', ...data } as never,
    });
    refs[label] = row.id;
  };
  await create('cA1', { scope: 'DEPARTMENT', departmentId: deptA, submittedById: sA1.id, categoryId: catA.id });
  await create('cA2', { scope: 'DEPARTMENT', departmentId: deptA, submittedById: sA2.id, categoryId: catA.id });
  await create('cB1', { scope: 'DEPARTMENT', departmentId: deptB, submittedById: sB.id, categoryId: catB.id });
  await create('cF', { scope: 'FACULTY', submittedById: sA1.id, categoryId: catF.id });
  await create('cEsc', {
    scope: 'DEPARTMENT',
    departmentId: deptB,
    submittedById: sB.id,
    categoryId: catB.id,
    escalatedToFaculty: true,
    escalatedAt: new Date(),
  });
}, 300_000);

afterAll(async () => {
  await cleanup();
  await prisma.department.deleteMany({ where: { code: { in: CODES } } });
  await prisma.$disconnect();
});

describe('who can see which complaints (database scope)', () => {
  test.each([
    ['studenta1', ['cA1', 'cF']], // their own, even the faculty-level one
    ['studenta2', ['cA2']], // not their classmate's complaint
    ['studentb', ['cB1', 'cEsc']],
    ['officera', ['cA1', 'cA2']], // all of department A, nothing from B, no faculty-level case
    ['hoda', ['cA1', 'cA2']],
    ['officerb', ['cB1', 'cEsc']],
    ['hodb', ['cB1', 'cEsc']],
    ['admin', ['cEsc', 'cF']], // faculty-level + escalated only: NOT cA1, cA2, cB1
    ['nobody', []],
  ])('%s sees %j', async (name, expected) => {
    expect(await visibleLabels(name)).toEqual([...expected].sort());
  });
});

describe('the policy function and the database scope always agree', () => {
  test('canViewComplaint matches complaintScopeWhere for every user and every complaint', async () => {
    const names = ['studenta1', 'studenta2', 'studentb', 'officera', 'hoda', 'officerb', 'hodb', 'admin', 'nobody'];
    const complaints = await prisma.complaint.findMany({ where: { reference: { startsWith: 'TN-' } } });
    for (const name of names) {
      const user = await loadUser(name);
      const visible = new Set(await visibleLabels(name));
      for (const c of complaints) {
        const label = c.reference.replace('TN-', '');
        expect(canViewComplaint(user, c), `${name} / ${label}`).toBe(visible.has(label));
      }
    }
  });
});

describe('losing a role removes access at once', () => {
  test('a suspended Officer sees nothing; reactivating restores access', async () => {
    await prisma.departmentMembership.updateMany({
      where: { user: { email: email('officera') } },
      data: { status: 'SUSPENDED' },
    });
    expect(await visibleLabels('officera')).toEqual([]);

    await prisma.departmentMembership.updateMany({
      where: { user: { email: email('officera') } },
      data: { status: 'ACTIVE' },
    });
    expect(await visibleLabels('officera')).toEqual(['cA1', 'cA2']);
  });

  test('a deactivated faculty role loses faculty access', async () => {
    await prisma.userFacultyRole.updateMany({ where: { user: { email: email('admin') } }, data: { isActive: false } });
    expect(await visibleLabels('admin')).toEqual([]);
    await prisma.userFacultyRole.updateMany({ where: { user: { email: email('admin') } }, data: { isActive: true } });
    expect(await visibleLabels('admin')).toEqual(['cEsc', 'cF']);
  });
});
