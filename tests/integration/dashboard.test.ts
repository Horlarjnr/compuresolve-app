import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import app from '../../src/app';
import { hashPassword } from '../../src/utils/password';
import { prisma } from '../../src/utils/prisma';

const PASSWORD = 'Str0ng!Pass#';
const DOMAIN = '@db.invalid';
const CODES = ['DBA', 'DBB', 'DBC'];
const e = (name: string) => `${name}${DOMAIN}`;
const DAY = 86_400_000;

let deptA = '';
let deptB = '';
let deptC = '';
const cookies: Record<string, string> = {};
const userIds: Record<string, string> = {};

const cleanup = async () => {
  await prisma.auditLog.deleteMany({ where: { department: { code: { in: CODES } } } });
  await prisma.complaint.deleteMany({ where: { submittedBy: { email: { endsWith: DOMAIN } } } });
  await prisma.complaintCategory.deleteMany({
    where: { OR: [{ department: { code: { in: CODES } } }, { name: { startsWith: 'DB ' } }] },
  });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
};

const login = async (name: string) => {
  const res = await request(app).post('/api/v1/auth/login').send({ email: e(name), password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('sid='))!.split(';')[0];
};
const summary = async (who: string) => {
  const res = await request(app).get('/api/v1/dashboard/summary').set('Cookie', cookies[who]);
  expect(res.status, `${who}: ${JSON.stringify(res.body)}`).toBe(200);
  return res.body.data;
};
const counts = (byStatus: Record<string, number>) =>
  Object.fromEntries(Object.entries(byStatus).filter(([, n]) => n > 0));

beforeAll(async () => {
  await cleanup();
  const a = await prisma.department.upsert({
    where: { name: 'Dashboard Test Dept A' },
    update: { isActive: true },
    create: { name: 'Dashboard Test Dept A', code: 'DBA' },
  });
  const b = await prisma.department.upsert({
    where: { name: 'Dashboard Test Dept B' },
    update: { isActive: true },
    create: { name: 'Dashboard Test Dept B', code: 'DBB' },
  });
  // Department C has no complaints and no other staff: it is the 'multi' person's own department as HOD.
  const c = await prisma.department.upsert({
    where: { name: 'Dashboard Test Dept C' },
    update: { isActive: true },
    create: { name: 'Dashboard Test Dept C', code: 'DBC' },
  });
  deptA = a.id;
  deptB = b.id;
  deptC = c.id;
  const catA = await prisma.complaintCategory.create({ data: { name: 'DB Cat A', scope: 'DEPARTMENT', departmentId: deptA } });
  const catB = await prisma.complaintCategory.create({ data: { name: 'DB Cat B', scope: 'DEPARTMENT', departmentId: deptB } });
  const catF = await prisma.complaintCategory.create({ data: { name: 'DB Faculty Cat', scope: 'FACULTY' } });

  const passwordHash = await hashPassword(PASSWORD);
  const make = async (name: string, extra: Record<string, unknown>) => {
    const u = await prisma.user.create({
      data: { fullName: name, email: e(name), passwordHash, emailVerifiedAt: new Date(), ...extra },
    });
    userIds[name] = u.id;
  };
  const role = (departmentId: string, r: string) => ({ memberships: { create: { departmentId, role: r } } });
  const student = (departmentId: string, n: number) => ({
    matricNumber: `DSH/1000/00${n}`,
    studentProfile: { create: { level: 'L200' } },
    ...role(departmentId, 'STUDENT'),
  });
  await make('studenta', student(deptA, 1));
  await make('studenta2', student(deptA, 2));
  await make('studentb', student(deptB, 3));
  await make('officera', role(deptA, 'OFFICER'));
  await make('officera2', role(deptA, 'OFFICER'));
  await make('hoda', role(deptA, 'HOD'));
  await make('officerb', role(deptB, 'OFFICER'));
  await make('hodb', role(deptB, 'HOD'));
  await make('admin', { facultyRoles: { create: { role: 'FACULTY_ADMIN' } } });
  await make('nobody', {});
  // one person who is an Officer in A and the HOD of C (each department keeps its single HOD)
  await make('multi', { memberships: { create: [{ departmentId: deptA, role: 'OFFICER' }, { departmentId: deptC, role: 'HOD' }] } });

  let n = 0;
  const complaint = async (
    submitter: string,
    data: { scope?: 'DEPARTMENT' | 'FACULTY'; dept?: string; cat: string; status: string; assignedTo?: string; escalated?: boolean; ageDays?: number },
  ) => {
    n += 1;
    return prisma.complaint.create({
      data: {
        reference: `DB-${n}`,
        title: `Dashboard complaint ${n}`,
        description: 'Dashboard test complaint body',
        scope: data.scope ?? 'DEPARTMENT',
        departmentId: data.scope === 'FACULTY' ? null : data.dept,
        submittedById: userIds[submitter],
        categoryId: data.cat,
        status: data.status as never,
        assignedToId: data.assignedTo ? userIds[data.assignedTo] : null,
        escalatedToFaculty: data.escalated ?? false,
        escalatedAt: data.escalated ? new Date() : null,
        createdAt: new Date(Date.now() - (data.ageDays ?? 1) * DAY - 3_600_000),
      },
    });
  };
  // Department A
  await complaint('studenta', { dept: deptA, cat: catA.id, status: 'SUBMITTED', ageDays: 10 }); // A1 unassigned, oldest open
  await complaint('studenta', { dept: deptA, cat: catA.id, status: 'UNDER_REVIEW', assignedTo: 'officera', ageDays: 5 }); // A2
  await complaint('studenta2', { dept: deptA, cat: catA.id, status: 'IN_PROGRESS', assignedTo: 'officera2', ageDays: 4 }); // A3
  await complaint('studenta', { dept: deptA, cat: catA.id, status: 'AWAITING_STUDENT', assignedTo: 'officera', ageDays: 3 }); // A4
  const a5 = await complaint('studenta2', { dept: deptA, cat: catA.id, status: 'RESOLVED', assignedTo: 'officera' }); // A5
  await complaint('studenta', { dept: deptA, cat: catA.id, status: 'CLOSED', assignedTo: 'officera2' }); // A6
  await complaint('studenta2', { dept: deptA, cat: catA.id, status: 'REJECTED' }); // A7
  await complaint('studenta', { dept: deptA, cat: catA.id, status: 'ESCALATED', escalated: true, ageDays: 20 }); // A8
  // Faculty level
  await complaint('studenta', { scope: 'FACULTY', cat: catF.id, status: 'SUBMITTED' }); // F1
  const f2 = await complaint('studenta2', { scope: 'FACULTY', cat: catF.id, status: 'RESOLVED' }); // F2
  // Department B
  await complaint('studentb', { dept: deptB, cat: catB.id, status: 'SUBMITTED' }); // B1
  await complaint('studentb', { dept: deptB, cat: catB.id, status: 'UNDER_REVIEW', assignedTo: 'officerb' }); // B2
  await complaint('studentb', { dept: deptB, cat: catB.id, status: 'ESCALATED', escalated: true }); // B3

  // pending reopen requests on A5 and F2 (both by studenta2)
  for (const c of [a5, f2]) {
    await prisma.complaintReopenRequest.create({ data: { complaintId: c.id, requesterId: userIds.studenta2, reason: 'Please look at this again.' } });
  }
  // notifications for studenta: 2 unread, 1 read
  await prisma.notification.createMany({
    data: [
      { userId: userIds.studenta, type: 'STATUS_CHANGED', title: 'Update', body: 'x' },
      { userId: userIds.studenta, type: 'STATUS_CHANGED', title: 'Update', body: 'y' },
      { userId: userIds.studenta, type: 'STATUS_CHANGED', title: 'Update', body: 'z', readAt: new Date() },
    ],
  });

  for (const name of ['studenta', 'studenta2', 'studentb', 'officera', 'officera2', 'hoda', 'officerb', 'hodb', 'admin', 'nobody', 'multi']) {
    cookies[name] = await login(name);
  }
}, 600_000);

afterAll(async () => {
  await cleanup();
  await prisma.department.deleteMany({ where: { code: { in: CODES } } });
  await prisma.$disconnect();
});

describe('student dashboard', () => {
  test('counts only their own complaints, with what needs their attention', async () => {
    const d = await summary('studenta');
    expect(d.roles).toEqual(['STUDENT']);
    expect(Object.keys(d).sort()).toEqual(['roles', 'student', 'unreadNotifications']);
    expect(d.student.total).toBe(6);
    expect(counts(d.student.byStatus)).toEqual({ SUBMITTED: 2, UNDER_REVIEW: 1, AWAITING_STUDENT: 1, CLOSED: 1, ESCALATED: 1 });
    expect(d.student.awaitingMyReply).toBe(1);
    expect(d.student.canRequestReopen).toBe(1); // the closed one
    expect(d.student.pendingReopenRequests).toBe(0);
    expect(d.unreadNotifications).toBe(2);
  });

  test('another student sees only theirs, including pending reopen requests', async () => {
    const d = await summary('studenta2');
    expect(d.student.total).toBe(4);
    expect(counts(d.student.byStatus)).toEqual({ IN_PROGRESS: 1, RESOLVED: 2, REJECTED: 1 });
    expect(d.student.pendingReopenRequests).toBe(2);
    expect(d.student.canRequestReopen).toBe(1); // only the rejected one (the resolved ones already have a pending request)
    expect(d.unreadNotifications).toBe(0);
  });

  test('the recent list is the student view: no staff names, no submitter object', async () => {
    const d = await summary('studenta');
    expect(d.student.recent.length).toBeLessThanOrEqual(5);
    expect(d.student.recent.length).toBeGreaterThan(0);
    for (const item of d.student.recent) {
      expect(item).not.toHaveProperty('assignedTo');
      expect(item).not.toHaveProperty('submittedBy');
    }
    const refs = d.student.recent.map((c: { reference: string }) => c.reference);
    expect(refs.every((r: string) => /^DB-(1|2|4|6|8|9)$/.test(r))).toBe(true); // only their own complaints
  });

  test('a student in another department sees nothing of department A', async () => {
    const d = await summary('studentb');
    expect(d.student.total).toBe(3);
    expect(counts(d.student.byStatus)).toEqual({ SUBMITTED: 1, UNDER_REVIEW: 1, ESCALATED: 1 });
  });
});

describe('officer dashboard', () => {
  test('shows the department queue, what is unassigned, what is mine, and the reopen decisions I can make', async () => {
    const d = await summary('officera');
    expect(Object.keys(d).sort()).toEqual(['officer', 'roles', 'unreadNotifications']);
    expect(d.officer.departments).toHaveLength(1);
    const dept = d.officer.departments[0];
    expect(dept.department).toMatchObject({ id: deptA, code: 'DBA' });
    expect(counts(dept.queue.byStatus)).toEqual({
      SUBMITTED: 1, UNDER_REVIEW: 1, IN_PROGRESS: 1, AWAITING_STUDENT: 1, ESCALATED: 1, RESOLVED: 1, CLOSED: 1, REJECTED: 1,
    });
    expect(dept.queue.open).toBe(4); // escalated, resolved, closed and rejected are not open workload
    expect(dept.queue.unassigned).toBe(1);
    expect(dept.assignedToMe.open).toBe(2);
    expect(counts(dept.assignedToMe.byStatus)).toEqual({ UNDER_REVIEW: 1, AWAITING_STUDENT: 1 });
    expect(d.officer.reopenDecisionsPending).toBe(1); // A5 is assigned to officera
    expect(d.officer.recentAssigned.map((c: { reference: string }) => c.reference).sort()).toEqual(['DB-2', 'DB-4', 'DB-5']);
  });

  test('a colleague has the same queue but different personal numbers', async () => {
    const d = await summary('officera2');
    const dept = d.officer.departments[0];
    expect(dept.queue.open).toBe(4);
    expect(dept.assignedToMe.open).toBe(1);
    expect(d.officer.reopenDecisionsPending).toBe(0);
  });

  test('another department\'s Officer sees only their own department', async () => {
    const d = await summary('officerb');
    const dept = d.officer.departments[0];
    expect(dept.department.id).toBe(deptB);
    expect(counts(dept.queue.byStatus)).toEqual({ SUBMITTED: 1, UNDER_REVIEW: 1, ESCALATED: 1 });
    expect(dept.queue.open).toBe(2);
    expect(JSON.stringify(d)).not.toContain(deptA);
  });
});

describe('head of department dashboard', () => {
  test('shows the department picture, the oldest open age (no overdue label) and officer workload', async () => {
    const d = await summary('hoda');
    expect(Object.keys(d).sort()).toEqual(['hod', 'roles', 'unreadNotifications']);
    const dept = d.hod.departments[0];
    expect(dept.department.id).toBe(deptA);
    expect(dept.open).toBe(4);
    expect(dept.unassigned).toBe(1);
    expect(dept.escalated).toBe(1);
    expect(dept.reopenPending).toBe(1); // A5; F2 belongs to the faculty
    expect(dept.oldestOpenAgeDays).toBe(10); // A1 (the older escalated A8 is not open workload)
    expect(JSON.stringify(dept)).not.toMatch(/overdue/i);
    // every active Officer of the department (including 'multi', who holds no cases), sorted by name
    expect(dept.officers).toEqual([
      { id: userIds.multi, fullName: 'multi', openAssigned: 0 },
      { id: userIds.officera, fullName: 'officera', openAssigned: 2 },
      { id: userIds.officera2, fullName: 'officera2', openAssigned: 1 },
    ]);
  });

  test('another HOD sees only their department', async () => {
    const d = await summary('hodb');
    const dept = d.hod.departments[0];
    expect(dept.department.id).toBe(deptB);
    expect(dept.open).toBe(2);
    expect(dept.escalated).toBe(1);
    expect(dept.reopenPending).toBe(0);
    expect(dept.officers).toEqual([{ id: userIds.officerb, fullName: 'officerb', openAssigned: 1 }]);
    expect(JSON.stringify(d)).not.toContain(userIds.officera);
  });
});

describe('Faculty Admin dashboard', () => {
  test('shows faculty-level and escalated cases only, never ordinary departmental complaints', async () => {
    const d = await summary('admin');
    expect(Object.keys(d).sort()).toEqual(['facultyAdmin', 'roles', 'unreadNotifications']);
    const fa = d.facultyAdmin;
    expect(counts(fa.facultyLevel.byStatus)).toEqual({ SUBMITTED: 1, RESOLVED: 1 });
    expect(fa.facultyLevel.open).toBe(1);
    expect(counts(fa.escalated.byStatus)).toEqual({ ESCALATED: 2 }); // A8 and B3
    expect(fa.escalated.total).toBe(2);
    expect(fa.reopenPending).toBe(1); // F2 only; A5 is a departmental case

    const refs = fa.recent.map((c: { reference: string }) => c.reference).sort();
    expect(refs).toEqual(['DB-10', 'DB-13', 'DB-8', 'DB-9']); // F1, F2, A8, B3 and nothing else
    expect(refs).not.toContain('DB-1'); // ordinary departmental complaint
  });
});

describe('edge cases', () => {
  test('a person holding two roles gets two sections, each limited to its own department', async () => {
    const d = await summary('multi');
    expect(d.roles.sort()).toEqual(['HOD', 'OFFICER']);
    expect(d.officer.departments.map((x: { department: { id: string } }) => x.department.id)).toEqual([deptA]);
    expect(d.hod.departments.map((x: { department: { id: string } }) => x.department.id)).toEqual([deptC]);
    expect(d.hod.departments[0]).toMatchObject({ open: 0, unassigned: 0, escalated: 0, oldestOpenAgeDays: null, officers: [] });
    expect(JSON.stringify(d.hod)).not.toContain(deptA); // the Officer role in A does not leak into the HOD section
    expect(d).not.toHaveProperty('student');
    expect(d).not.toHaveProperty('facultyAdmin');
  });

  test('a user with no roles gets no sections', async () => {
    const d = await summary('nobody');
    expect(d).toEqual({ roles: [], unreadNotifications: 0 });
  });

  test('losing a role removes its section at once', async () => {
    await prisma.departmentMembership.updateMany({ where: { user: { email: e('officera2') } }, data: { status: 'SUSPENDED' } });
    const d = await summary('officera2');
    expect(d).not.toHaveProperty('officer');
    await prisma.departmentMembership.updateMany({ where: { user: { email: e('officera2') } }, data: { status: 'ACTIVE' } });
    expect(await summary('officera2')).toHaveProperty('officer');
  });

  test('a suspended Officer disappears from the HOD workload table', async () => {
    await prisma.departmentMembership.updateMany({ where: { user: { email: e('officera2') } }, data: { status: 'SUSPENDED' } });
    const d = await summary('hoda');
    expect(d.hod.departments[0].officers.map((o: { fullName: string }) => o.fullName)).toEqual(['multi', 'officera']);
    await prisma.departmentMembership.updateMany({ where: { user: { email: e('officera2') } }, data: { status: 'ACTIVE' } });
  });

  test('signed-out users are refused and unknown options are rejected', async () => {
    expect((await request(app).get('/api/v1/dashboard/summary')).status).toBe(401);
    const res = await request(app).get('/api/v1/dashboard/summary?olderThanDays=7').set('Cookie', cookies.hoda);
    expect(res.status).toBe(400);
  });
});
