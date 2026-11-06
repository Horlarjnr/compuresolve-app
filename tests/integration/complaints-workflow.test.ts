import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

// Lets one test make the audit write fail, to prove status changes roll back completely.
const flags = vi.hoisted(() => ({ failAudit: false }));
vi.mock('../../src/services/audit.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/audit.service')>();
  return {
    ...actual,
    recordAudit: (...args: Parameters<typeof actual.recordAudit>) => {
      if (flags.failAudit) throw new Error('simulated failure');
      return actual.recordAudit(...args);
    },
  };
});

import app from '../../src/app';
import { hashPassword } from '../../src/utils/password';
import { prisma } from '../../src/utils/prisma';

const PASSWORD = 'Str0ng!Pass#';
const DOMAIN = '@wf.invalid';
const CODES = ['WFA', 'WFB'];
const BODY = 'This is a complaint body that is long enough to pass validation.';
const REASON = 'A clear reason that the student will read.';
const e = (name: string) => `${name}${DOMAIN}`;

let deptA = '';
let deptB = '';
let catA = '';
let catF = '';
const cookies: Record<string, string> = {};
const userIds: Record<string, string> = {};

const cleanup = async () => {
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actor: { email: { endsWith: DOMAIN } } }, { department: { code: { in: CODES } } }] },
  });
  await prisma.complaint.deleteMany({ where: { submittedBy: { email: { endsWith: DOMAIN } } } });
  await prisma.complaintCategory.deleteMany({
    where: { OR: [{ department: { code: { in: CODES } } }, { name: { startsWith: 'WF ' } }] },
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
const del = (who: string, path: string) => request(app).delete(`/api/v1${path}`).set('Cookie', cookies[who]);

const newComplaint = async (faculty = false, who = 'studenta') => {
  const res = await post(who, '/complaints', {
    ...(faculty ? { target: 'FACULTY', categoryId: catF } : { categoryId: catA }),
    title: 'Workflow test complaint',
    description: BODY,
  });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
};
const assign = (who: string, id: string, officer: string) =>
  post(who, `/complaints/${id}/assignments`, { officerId: userIds[officer] });
const move = (who: string, id: string, toStatus: string, reason?: string) =>
  post(who, `/complaints/${id}/status-transitions`, { toStatus, ...(reason ? { reason } : {}) });
const row = (id: string) =>
  prisma.complaint.findUniqueOrThrow({
    where: { id },
    include: { statusHistory: { orderBy: { createdAt: 'asc' } }, assignments: { orderBy: { assignedAt: 'asc' } }, escalations: true },
  });

beforeAll(async () => {
  await cleanup();
  const a = await prisma.department.upsert({
    where: { name: 'Workflow Test Dept A' },
    update: { isActive: true },
    create: { name: 'Workflow Test Dept A', code: 'WFA' },
  });
  const b = await prisma.department.upsert({
    where: { name: 'Workflow Test Dept B' },
    update: { isActive: true },
    create: { name: 'Workflow Test Dept B', code: 'WFB' },
  });
  deptA = a.id;
  deptB = b.id;
  catA = (await prisma.complaintCategory.create({ data: { name: 'WF Cat A', scope: 'DEPARTMENT', departmentId: deptA } })).id;
  catF = (await prisma.complaintCategory.create({ data: { name: 'WF Faculty Cat', scope: 'FACULTY' } })).id;

  const passwordHash = await hashPassword(PASSWORD);
  const make = async (name: string, extra: Record<string, unknown>) => {
    const u = await prisma.user.create({
      data: { fullName: name, email: e(name), passwordHash, emailVerifiedAt: new Date(), ...extra },
    });
    userIds[name] = u.id;
  };
  const role = (departmentId: string, r: string) => ({ memberships: { create: { departmentId, role: r } } });
  await make('studenta', {
    matricNumber: 'WFL/1000/001',
    studentProfile: { create: { level: 'L200' } },
    ...role(deptA, 'STUDENT'),
  });
  await make('officera', role(deptA, 'OFFICER'));
  await make('officera2', role(deptA, 'OFFICER'));
  await make('hoda', role(deptA, 'HOD'));
  await make('officerb', role(deptB, 'OFFICER'));
  await make('hodb', role(deptB, 'HOD'));
  await make('admin', { facultyRoles: { create: { role: 'FACULTY_ADMIN' } } });
  for (const n of ['studenta', 'officera', 'officera2', 'hoda', 'officerb', 'hodb', 'admin']) cookies[n] = await login(n);
}, 600_000);

afterAll(async () => {
  flags.failAudit = false;
  await cleanup();
  await prisma.department.deleteMany({ where: { code: { in: CODES } } });
  await prisma.$disconnect();
});

describe('assigning complaints', () => {
  test('an Officer claims an unassigned complaint; staff see it, the student only sees that it is assigned', async () => {
    const id = await newComplaint();
    const before = await get('officera', `/complaints/${id}`);
    expect(before.body.data.allowedTransitions).toEqual([]); // must claim first

    const res = await assign('officera', id, 'officera');
    expect(res.status).toBe(200);
    expect(res.body.data.assignedTo.id).toBe(userIds.officera);
    expect(res.body.data.allowedTransitions).toContain('UNDER_REVIEW');

    const db = await row(id);
    expect(db.assignedToId).toBe(userIds.officera);
    expect(db.assignments).toHaveLength(1);
    expect(db.assignments[0]).toMatchObject({ officerId: userIds.officera, assignedById: userIds.officera, unassignedAt: null });
    expect(await prisma.auditLog.count({ where: { entityId: id, action: 'complaint.assigned' } })).toBe(1);

    const student = await get('studenta', `/complaints/${id}`);
    expect(student.body.data.assigned).toBe(true);
    expect(student.body.data).not.toHaveProperty('assignedTo');
  });

  test('Officers cannot assign others, cannot take over a colleague\'s complaint', async () => {
    const id = await newComplaint();
    expect((await assign('officera', id, 'officera2')).status).toBe(403);
    expect((await assign('officera', id, 'officera')).status).toBe(200);
    const takeOver = await assign('officera2', id, 'officera2');
    expect(takeOver.status).toBe(409);
    expect(takeOver.body.code).toBe('ALREADY_ASSIGNED');
  });

  test('the HOD reassigns; the old assignment is closed and history is kept', async () => {
    const id = await newComplaint();
    await assign('officera', id, 'officera');
    const res = await assign('hoda', id, 'officera2');
    expect(res.status).toBe(200);

    const db = await row(id);
    expect(db.assignedToId).toBe(userIds.officera2);
    expect(db.assignments).toHaveLength(2);
    expect(db.assignments[0].unassignedAt).not.toBeNull();
    expect(db.assignments[1].unassignedAt).toBeNull();
    expect(db.assignments[1].assignedById).toBe(userIds.hoda);

    const same = await assign('hoda', id, 'officera2');
    expect(same.status).toBe(409);
    expect(same.body.code).toBe('NO_CHANGE');
  });

  test('the assignee must be an active Officer of the same department', async () => {
    const id = await newComplaint();
    expect((await assign('hoda', id, 'officerb')).body.code).toBe('INVALID_ASSIGNEE'); // other department
    expect((await assign('hoda', id, 'hoda')).body.code).toBe('INVALID_ASSIGNEE'); // a HOD is not an Officer
    expect((await post('hoda', `/complaints/${id}/assignments`, { officerId: '00000000-0000-4000-8000-000000000000' })).status).toBe(400);

    await prisma.departmentMembership.updateMany({ where: { userId: userIds.officera2 }, data: { status: 'SUSPENDED' } });
    expect((await assign('hoda', id, 'officera2')).body.code).toBe('INVALID_ASSIGNEE');
    await prisma.departmentMembership.updateMany({ where: { userId: userIds.officera2 }, data: { status: 'ACTIVE' } });
    expect((await assign('hoda', id, 'officera2')).status).toBe(200);
  });

  test('only the HOD can remove an assignment', async () => {
    const id = await newComplaint();
    await assign('officera', id, 'officera');
    expect((await del('officera', `/complaints/${id}/assignments/current`)).status).toBe(403);

    const res = await del('hoda', `/complaints/${id}/assignments/current`);
    expect(res.status).toBe(200);
    expect(res.body.data.assignedTo).toBeNull();
    const db = await row(id);
    expect(db.assignedToId).toBeNull();
    expect(db.assignments[0].unassignedAt).not.toBeNull();

    const again = await del('hoda', `/complaints/${id}/assignments/current`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('NO_CHANGE');
  });

  test('other departments get 404; the Faculty Admin, students and signed-out users are refused; bad bodies fail', async () => {
    const id = await newComplaint();
    expect((await assign('officerb', id, 'officerb')).status).toBe(404);
    expect((await assign('hodb', id, 'officera')).status).toBe(404);
    expect((await assign('admin', id, 'officera')).status).toBe(403);
    expect((await assign('studenta', id, 'officera')).status).toBe(403);
    expect((await request(app).post(`/api/v1/complaints/${id}/assignments`).send({})).status).toBe(401);
    expect((await post('hoda', `/complaints/${id}/assignments`, {})).status).toBe(400);
    expect((await post('hoda', `/complaints/${id}/assignments`, { officerId: userIds.officera, status: 'CLOSED' })).status).toBe(400);
    expect((await row(id)).assignedToId).toBeNull();
  });
});

describe('the full complaint lifecycle', () => {
  test('claim, review, ask the student, work, resolve, close: every step recorded', async () => {
    const id = await newComplaint();
    expect((await move('officera2', id, 'UNDER_REVIEW')).body.code).toBe('NOT_ASSIGNED');
    await assign('officera', id, 'officera');

    expect((await move('officera', id, 'UNDER_REVIEW')).status).toBe(200);

    const noReason = await move('officera', id, 'AWAITING_STUDENT');
    expect(noReason.status).toBe(400);
    expect(noReason.body.code).toBe('VALIDATION_ERROR');
    expect((await move('officera', id, 'AWAITING_STUDENT', 'Please upload your payment receipt.')).status).toBe(200);

    const student = await get('studenta', `/complaints/${id}`);
    expect(student.body.data.status).toBe('AWAITING_STUDENT');
    const last = student.body.data.statusHistory.at(-1);
    expect(last.reason).toBe('Please upload your payment receipt.'); // the student sees what is needed
    expect(last).not.toHaveProperty('actor');

    expect((await move('officera', id, 'IN_PROGRESS')).status).toBe(200);
    const resolved = await move('officera', id, 'RESOLVED', 'The result was corrected in the system.');
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.resolutionNote).toBe('The result was corrected in the system.');
    expect(resolved.body.data.resolvedAt).toBeTruthy();

    const closed = await move('officera', id, 'CLOSED');
    expect(closed.status).toBe(200);
    expect(closed.body.data.closedAt).toBeTruthy();
    expect(closed.body.data.allowedTransitions).toEqual([]);

    const again = await move('hoda', id, 'IN_PROGRESS');
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('INVALID_TRANSITION');

    const db = await row(id);
    expect(db.statusHistory.map((h) => h.toStatus)).toEqual([
      'SUBMITTED', 'UNDER_REVIEW', 'AWAITING_STUDENT', 'IN_PROGRESS', 'RESOLVED', 'CLOSED',
    ]);
    expect(db.statusHistory.map((h) => h.fromStatus)).toEqual([
      null, 'SUBMITTED', 'UNDER_REVIEW', 'AWAITING_STUDENT', 'IN_PROGRESS', 'RESOLVED',
    ]);
    expect(db.statusHistory[1].actorId).toBe(userIds.officera);
    expect(await prisma.auditLog.count({ where: { entityId: id, action: { startsWith: 'complaint.status.' } } })).toBe(5);
  });

  test('impossible and forbidden moves are refused with different answers', async () => {
    const id = await newComplaint();
    await assign('officera', id, 'officera');
    expect((await move('officera', id, 'RESOLVED', REASON)).body.code).toBe('INVALID_TRANSITION'); // must be reviewed first
    expect((await move('officera', id, 'SUBMITTED')).body.code).toBe('INVALID_TRANSITION');
    expect((await move('officera', id, 'REJECTED', REASON)).body.code).toBe('FORBIDDEN_TRANSITION'); // HOD only
    expect((await move('officera', id, 'ESCALATED', REASON)).body.code).toBe('FORBIDDEN_TRANSITION'); // HOD only
    expect((await move('officera', id, 'NOT_A_STATUS')).status).toBe(400);
    expect((await post('officera', `/complaints/${id}/status-transitions`, { toStatus: 'UNDER_REVIEW', priority: 'URGENT' })).status).toBe(400);
    expect((await row(id)).status).toBe('SUBMITTED');
  });

  test('the HOD can reject with a reason and needs no assignment; rejection is final', async () => {
    const id = await newComplaint();
    expect((await move('hoda', id, 'REJECTED')).status).toBe(400); // reason required
    const res = await move('hoda', id, 'REJECTED', 'This is not a matter for the department.');
    expect(res.status).toBe(200);

    const student = await get('studenta', `/complaints/${id}`);
    expect(student.body.data.status).toBe('REJECTED');
    expect(student.body.data.statusHistory.at(-1).reason).toBe('This is not a matter for the department.');
    expect((await move('hoda', id, 'UNDER_REVIEW')).status).toBe(409);
  });

  test('two people acting at the same moment: exactly one change is recorded', async () => {
    const id = await newComplaint();
    const results = await Promise.all([move('hoda', id, 'UNDER_REVIEW'), move('hoda', id, 'UNDER_REVIEW')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const db = await row(id);
    expect(db.statusHistory.filter((h) => h.toStatus === 'UNDER_REVIEW')).toHaveLength(1);
  });

  test('if any part of a change fails, nothing is saved (status and history roll back together)', async () => {
    const id = await newComplaint();
    flags.failAudit = true;
    const res = await move('hoda', id, 'UNDER_REVIEW');
    flags.failAudit = false;

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    const db = await row(id);
    expect(db.status).toBe('SUBMITTED');
    expect(db.statusHistory).toHaveLength(1); // only the original SUBMITTED row

    expect((await move('hoda', id, 'UNDER_REVIEW')).status).toBe(200); // and it still works afterwards
  });
});

describe('escalation to the Faculty Admin', () => {
  test('only the HOD escalates, with a reason; it clears the assignee and hands the case over', async () => {
    const id = await newComplaint();
    await assign('officera', id, 'officera');
    await move('officera', id, 'UNDER_REVIEW');

    expect((await move('officera', id, 'ESCALATED', REASON)).status).toBe(403);
    expect((await move('hoda', id, 'ESCALATED')).status).toBe(400);

    const res = await move('hoda', id, 'ESCALATED', 'The department cannot resolve this on its own.');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ESCALATED');
    expect(res.body.data.escalatedToFaculty).toBe(true);
    expect(res.body.data.assignedTo).toBeNull();

    const db = await row(id);
    expect(db.assignedToId).toBeNull();
    expect(db.escalatedAt).not.toBeNull();
    expect(db.assignments.every((a) => a.unassignedAt !== null)).toBe(true);
    expect(db.escalations).toHaveLength(1);
    expect(db.escalations[0]).toMatchObject({
      escalatedById: userIds.hoda,
      fromDepartmentId: deptA,
      reason: 'The department cannot resolve this on its own.',
    });
    expect(db.statusHistory.at(-1)).toMatchObject({ fromStatus: 'UNDER_REVIEW', toStatus: 'ESCALATED' });
  });

  test('after escalation the department can read but not change it; the Faculty Admin owns it', async () => {
    const id = await newComplaint();
    await move('hoda', id, 'ESCALATED', REASON);

    for (const who of ['hoda', 'officera']) {
      const view = await get(who, `/complaints/${id}`);
      expect(view.status).toBe(200);
      expect(view.body.data.allowedTransitions).toEqual([]);
      expect((await move(who, id, 'UNDER_REVIEW')).status).toBe(403);
    }
    expect((await assign('hoda', id, 'officera')).body.code).toBe('NOT_ASSIGNABLE');

    expect((await get('admin', `/complaints/${id}`)).status).toBe(200);
    const list = await get('admin', '/complaints?status=ESCALATED&limit=100');
    expect(list.body.data.map((c: { id: string }) => c.id)).toContain(id);
  });

  test('the Faculty Admin works the case to the end but cannot escalate further', async () => {
    const id = await newComplaint();
    await move('hoda', id, 'ESCALATED', REASON);

    expect((await move('admin', id, 'UNDER_REVIEW')).status).toBe(200);
    expect((await move('admin', id, 'ESCALATED', REASON)).body.code).toBe('FORBIDDEN_TRANSITION');
    expect((await move('admin', id, 'IN_PROGRESS')).status).toBe(200);
    expect((await move('admin', id, 'RESOLVED')).status).toBe(400); // reason required
    const resolved = await move('admin', id, 'RESOLVED', 'Resolved at faculty level with the registry.');
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.resolutionNote).toBe('Resolved at faculty level with the registry.');
    expect((await move('admin', id, 'CLOSED')).status).toBe(200);
  });
});

describe('faculty-level complaints', () => {
  test('department staff cannot see or change them; the Faculty Admin handles them, including rejection', async () => {
    const id = await newComplaint(true);
    expect((await move('hoda', id, 'UNDER_REVIEW')).status).toBe(404);
    expect((await move('officera', id, 'UNDER_REVIEW')).status).toBe(404);
    expect((await assign('hoda', id, 'officera')).status).toBe(404);

    expect((await move('admin', id, 'ESCALATED', REASON)).body.code).toBe('FORBIDDEN_TRANSITION');
    expect((await move('admin', id, 'UNDER_REVIEW')).status).toBe(200);

    const other = await newComplaint(true);
    expect((await move('admin', other, 'REJECTED', 'Not a faculty matter.')).status).toBe(200);
  });
});

describe('isolation and permissions over HTTP', () => {
  test('other departments, the Faculty Admin on ordinary complaints, students and signed-out users are all kept out', async () => {
    const id = await newComplaint();
    expect((await move('hodb', id, 'UNDER_REVIEW')).status).toBe(404);
    expect((await move('officerb', id, 'UNDER_REVIEW')).status).toBe(404);
    expect((await move('admin', id, 'UNDER_REVIEW')).status).toBe(404); // not escalated, not faculty-level
    expect((await move('studenta', id, 'UNDER_REVIEW')).status).toBe(403); // students never change status
    expect((await request(app).post(`/api/v1/complaints/${id}/status-transitions`).send({ toStatus: 'UNDER_REVIEW' })).status).toBe(401);
    expect((await move('hoda', '00000000-0000-4000-8000-000000000000', 'UNDER_REVIEW')).status).toBe(404);
    expect((await row(id)).status).toBe('SUBMITTED');
  });
});
