import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import app from '../../src/app';
import { hashPassword } from '../../src/utils/password';
import { prisma } from '../../src/utils/prisma';

const PASSWORD = 'Str0ng!Pass#';
const DOMAIN = '@ro.invalid';
const CODES = ['ROA', 'ROB'];
const BODY = 'This is a complaint body that is long enough to pass validation.';
const REASON = 'A clear reason that the student will read.';
const WHY = 'The problem came back after the fix, so please look again.';
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
    where: { OR: [{ department: { code: { in: CODES } } }, { name: { startsWith: 'RO ' } }] },
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

const newComplaint = async (faculty = false) => {
  const res = await post('studenta', '/complaints', {
    ...(faculty ? { target: 'FACULTY', categoryId: catF } : { categoryId: catA }),
    title: 'Reopen test complaint',
    description: BODY,
  });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
};
const move = async (who: string, id: string, toStatus: string, reason?: string) => {
  const res = await post(who, `/complaints/${id}/status-transitions`, { toStatus, ...(reason ? { reason } : {}) });
  expect(res.status, `${who} -> ${toStatus}: ${JSON.stringify(res.body)}`).toBe(200);
};
// Drives a complaint to a final-ish state through the real workflow.
// Assignment is only possible while a complaint is open, so it happens BEFORE resolving.
const resolved = async (assignTo?: string) => {
  const id = await newComplaint();
  if (assignTo) {
    const res = await post('hoda', `/complaints/${id}/assignments`, { officerId: userIds[assignTo] });
    expect(res.status).toBe(200);
  }
  await move('hoda', id, 'UNDER_REVIEW');
  await move('hoda', id, 'RESOLVED', REASON);
  return id;
};
const closed = async () => {
  const id = await resolved();
  await move('hoda', id, 'CLOSED');
  return id;
};
const rejected = async () => {
  const id = await newComplaint();
  await move('hoda', id, 'REJECTED', REASON);
  return id;
};
const askReopen = (who: string, id: string, reason = WHY) => post(who, `/complaints/${id}/reopen-requests`, { reason });
const decide = (who: string, requestId: string, body: object) => post(who, `/reopen-requests/${requestId}/decision`, body);
const pendingId = async (complaintId: string) =>
  (await prisma.complaintReopenRequest.findFirstOrThrow({ where: { complaintId, status: 'PENDING' } })).id;
const complaintRow = (id: string) =>
  prisma.complaint.findUniqueOrThrow({
    where: { id },
    include: { statusHistory: { orderBy: { createdAt: 'asc' } }, reopenRequests: true },
  });

beforeAll(async () => {
  await cleanup();
  const a = await prisma.department.upsert({
    where: { name: 'Reopen Test Dept A' },
    update: { isActive: true },
    create: { name: 'Reopen Test Dept A', code: 'ROA' },
  });
  const b = await prisma.department.upsert({
    where: { name: 'Reopen Test Dept B' },
    update: { isActive: true },
    create: { name: 'Reopen Test Dept B', code: 'ROB' },
  });
  deptA = a.id;
  deptB = b.id;
  catA = (await prisma.complaintCategory.create({ data: { name: 'RO Cat A', scope: 'DEPARTMENT', departmentId: deptA } })).id;
  catF = (await prisma.complaintCategory.create({ data: { name: 'RO Faculty Cat', scope: 'FACULTY' } })).id;

  const passwordHash = await hashPassword(PASSWORD);
  const make = async (name: string, extra: Record<string, unknown>) => {
    const u = await prisma.user.create({
      data: { fullName: name, email: e(name), passwordHash, emailVerifiedAt: new Date(), ...extra },
    });
    userIds[name] = u.id;
  };
  const role = (departmentId: string, r: string) => ({ memberships: { create: { departmentId, role: r } } });
  const student = (n: number) => ({
    matricNumber: `REO/1000/00${n}`,
    studentProfile: { create: { level: 'L200' } },
    ...role(deptA, 'STUDENT'),
  });
  await make('studenta', student(1));
  await make('studenta2', student(2));
  await make('officera', role(deptA, 'OFFICER'));
  await make('officera2', role(deptA, 'OFFICER'));
  await make('hoda', role(deptA, 'HOD'));
  await make('officerb', role(deptB, 'OFFICER'));
  await make('hodb', role(deptB, 'HOD'));
  await make('admin', { facultyRoles: { create: { role: 'FACULTY_ADMIN' } } });
  for (const n of ['studenta', 'studenta2', 'officera', 'officera2', 'hoda', 'officerb', 'hodb', 'admin']) {
    cookies[n] = await login(n);
  }
}, 600_000);

afterAll(async () => {
  await cleanup();
  await prisma.department.deleteMany({ where: { code: { in: CODES } } });
  await prisma.$disconnect();
});

describe('asking for a reopen', () => {
  test('only resolved, closed or rejected complaints can be reopened', async () => {
    const open = await newComplaint();
    const refusedNew = await askReopen('studenta', open);
    expect(refusedNew.status).toBe(409);
    expect(refusedNew.body.code).toBe('NOT_REOPENABLE');

    await move('hoda', open, 'UNDER_REVIEW');
    expect((await askReopen('studenta', open)).body.code).toBe('NOT_REOPENABLE');

    expect((await askReopen('studenta', await resolved())).status).toBe(201);
    expect((await askReopen('studenta', await closed())).status).toBe(201);
    expect((await askReopen('studenta', await rejected())).status).toBe(201);
  });

  test('creates a PENDING request, is audited, and changes nothing about the complaint (no automatic reopen)', async () => {
    const id = await resolved();
    const before = await complaintRow(id);

    const res = await askReopen('studenta', id);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('RESOLVED'); // still resolved
    expect(res.body.data.canRequestReopen).toBe(false); // one pending request at a time
    expect(res.body.data.reopenRequests).toHaveLength(1);
    expect(res.body.data.reopenRequests[0]).toMatchObject({ status: 'PENDING', reason: WHY });
    expect(res.body.data.reopenRequests[0]).not.toHaveProperty('decidedBy');

    const after = await complaintRow(id);
    expect(after.status).toBe('RESOLVED');
    expect(after.resolvedAt).toEqual(before.resolvedAt);
    expect(after.statusHistory).toHaveLength(before.statusHistory.length); // no status change recorded
    expect(after.reopenRequests).toHaveLength(1);
    expect(after.reopenRequests[0].requesterId).toBe(userIds.studenta);
    expect(await prisma.auditLog.count({ where: { action: 'complaint.reopen_requested', metadata: { path: ['complaintId'], equals: id } } })).toBe(1);

    const again = await askReopen('studenta', id);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('REOPEN_PENDING');
  });

  test('two requests at the same moment create exactly one', async () => {
    const id = await resolved();
    const results = await Promise.all([askReopen('studenta', id), askReopen('studenta', id)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.complaintReopenRequest.count({ where: { complaintId: id, status: 'PENDING' } })).toBe(1);
  });

  test('only the student who submitted it can ask; others see "not found"; bad input is refused', async () => {
    const id = await resolved();
    expect((await askReopen('studenta2', id)).status).toBe(404); // classmate
    expect((await askReopen('studenta', '00000000-0000-4000-8000-000000000000')).status).toBe(404);
    for (const who of ['officera', 'hoda', 'admin']) expect((await askReopen(who, id)).status).toBe(403);
    expect((await request(app).post(`/api/v1/complaints/${id}/reopen-requests`).send({ reason: WHY })).status).toBe(401);
    expect((await askReopen('studenta', id, 'too short')).status).toBe(400);
    expect((await post('studenta', `/complaints/${id}/reopen-requests`, { reason: WHY, status: 'UNDER_REVIEW' })).status).toBe(400);
    expect(await prisma.complaintReopenRequest.count({ where: { complaintId: id } })).toBe(0);
  });

  test('a reopen can never be done through the ordinary status endpoint', async () => {
    const id = await closed();
    for (const who of ['hoda', 'officera']) {
      const res = await post(who, `/complaints/${id}/status-transitions`, { toStatus: 'UNDER_REVIEW' });
      expect([403, 409]).toContain(res.status);
    }
    expect((await complaintRow(id)).status).toBe('CLOSED');
  });
});

describe('the staff queue', () => {
  test('staff see requests on complaints they may see, with a canDecide flag; the student sees only their own', async () => {
    const id = await resolved('officera');
    await askReopen('studenta', id);
    const requestId = await pendingId(id);

    const ids = async (who: string) =>
      (await get(who, '/reopen-requests?status=PENDING&limit=100')).body.data.map((r: { id: string }) => r.id);

    const hod = await get('hoda', '/reopen-requests?status=PENDING&limit=100');
    const mine = hod.body.data.find((r: { id: string }) => r.id === requestId);
    expect(mine.canDecide).toBe(true);
    expect(mine.requester.matricNumber).toBe('REO/1000/001');
    expect(mine.complaint.reference).toMatch(/^CR-ROA-/);

    const assigned = (await get('officera', '/reopen-requests?status=PENDING&limit=100')).body.data.find((r: { id: string }) => r.id === requestId);
    expect(assigned.canDecide).toBe(true); // assigned Officer
    const other = (await get('officera2', '/reopen-requests?status=PENDING&limit=100')).body.data.find((r: { id: string }) => r.id === requestId);
    expect(other.canDecide).toBe(false); // same department, not assigned

    expect(await ids('hodb')).not.toContain(requestId);
    expect(await ids('officerb')).not.toContain(requestId);
    expect(await ids('admin')).not.toContain(requestId); // ordinary departmental complaint
    expect(await ids('studenta2')).not.toContain(requestId); // classmate

    const student = (await get('studenta', '/reopen-requests?limit=100')).body.data.find((r: { id: string }) => r.id === requestId);
    expect(student).toBeTruthy();
    expect(student).not.toHaveProperty('requester');
    expect(student).not.toHaveProperty('canDecide');
    expect((await request(app).get('/api/v1/reopen-requests')).status).toBe(401);
    expect((await get('hoda', '/reopen-requests?bogus=1')).status).toBe(400);
  });
});

describe('deciding', () => {
  test('who may decide: the assigned Officer or the HOD; not an unassigned Officer, other departments or students', async () => {
    const id = await resolved('officera');
    await askReopen('studenta', id);
    const requestId = await pendingId(id);
    const approve = { decision: 'APPROVE' };

    const unassigned = await decide('officera2', requestId, approve);
    expect(unassigned.status).toBe(403);
    expect(unassigned.body.code).toBe('FORBIDDEN');
    expect((await decide('hodb', requestId, approve)).status).toBe(404);
    expect((await decide('officerb', requestId, approve)).status).toBe(404);
    expect((await decide('admin', requestId, approve)).status).toBe(404);
    expect((await decide('studenta', requestId, approve)).status).toBe(403);
    expect((await request(app).post(`/api/v1/reopen-requests/${requestId}/decision`).send(approve)).status).toBe(401);
    expect((await decide('hoda', '00000000-0000-4000-8000-000000000000', approve)).status).toBe(404);

    expect((await prisma.complaintReopenRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe('PENDING');
    expect((await complaintRow(id)).status).toBe('RESOLVED');
  });

  test('bad decisions are refused: a rejection needs a note, unknown values and extra fields fail', async () => {
    const id = await resolved();
    await askReopen('studenta', id);
    const requestId = await pendingId(id);
    const noNote = await decide('hoda', requestId, { decision: 'REJECT' });
    expect(noNote.status).toBe(400);
    expect(noNote.body.code).toBe('VALIDATION_ERROR');
    expect((await decide('hoda', requestId, { decision: 'MAYBE' })).status).toBe(400);
    expect((await decide('hoda', requestId, { decision: 'APPROVE', status: 'CLOSED' })).status).toBe(400);
  });

  test('approving moves the complaint back to UNDER_REVIEW and records everything; the case can then continue', async () => {
    const id = await resolved('officera');
    await askReopen('studenta', id);
    const requestId = await pendingId(id);

    const res = await decide('officera', requestId, { decision: 'APPROVE', note: 'Reopened to check the result again.' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('UNDER_REVIEW');
    expect(res.body.data.resolvedAt).toBeNull();
    expect(res.body.data.resolutionNote).toBeNull();
    expect(res.body.data.canDecideReopen).toBe(false);

    const db = await complaintRow(id);
    const last = db.statusHistory.at(-1)!;
    expect(last).toMatchObject({
      fromStatus: 'RESOLVED',
      toStatus: 'UNDER_REVIEW',
      actorId: userIds.officera,
      reason: 'Reopened to check the result again.',
    });
    const req = db.reopenRequests[0];
    expect(req).toMatchObject({ status: 'APPROVED', decidedById: userIds.officera, decisionNote: 'Reopened to check the result again.' });
    expect(req.decidedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: 'complaint.reopen_approved', entityId: requestId } })).toBe(1);

    const student = await get('studenta', `/complaints/${id}`);
    expect(student.body.data.status).toBe('UNDER_REVIEW');
    expect(student.body.data.reopenRequests[0].status).toBe('APPROVED');
    expect(student.body.data.canRequestReopen).toBe(false); // open again, nothing to reopen

    const again = await decide('hoda', requestId, { decision: 'APPROVE' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('REQUEST_DECIDED');

    // the case carries on normally and can be reopened again later
    await move('officera', id, 'IN_PROGRESS');
    await move('officera', id, 'RESOLVED', 'Fixed properly this time.');
    expect((await askReopen('studenta', id)).status).toBe(201);
  });

  test('rejecting leaves the complaint alone and the student sees the explanation', async () => {
    const id = await closed();
    await askReopen('studenta', id);
    const requestId = await pendingId(id);

    const res = await decide('hoda', requestId, { decision: 'REJECT', note: 'The matter was fully settled.' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CLOSED');

    const db = await complaintRow(id);
    expect(db.status).toBe('CLOSED');
    expect(db.statusHistory.at(-1)!.toStatus).toBe('CLOSED'); // no history row for a rejection
    expect(db.reopenRequests[0]).toMatchObject({ status: 'REJECTED', decidedById: userIds.hoda });

    const student = await get('studenta', `/complaints/${id}`);
    expect(student.body.data.reopenRequests[0]).toMatchObject({ status: 'REJECTED', decisionNote: 'The matter was fully settled.' });
    expect(student.body.data.canRequestReopen).toBe(true); // a rejected request does not block a new one
  });

  test('the HOD can reopen closed and rejected complaints without being assigned', async () => {
    for (const make of [closed, rejected]) {
      const id = await make();
      await askReopen('studenta', id);
      const res = await decide('hoda', await pendingId(id), { decision: 'APPROVE' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('UNDER_REVIEW');
      expect(res.body.data.statusHistory.at(-1).reason).toBe('Reopen request approved');
    }
  });

  test('if the complaint changed while the request waited, the approval fails and nothing is saved', async () => {
    const id = await resolved();
    await askReopen('studenta', id);
    const requestId = await pendingId(id);
    await prisma.complaint.update({ where: { id }, data: { status: 'UNDER_REVIEW', resolvedAt: null } }); // simulate a change

    const res = await decide('hoda', requestId, { decision: 'APPROVE' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_REOPENABLE');
    expect((await prisma.complaintReopenRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe('PENDING');
  });
});

describe('escalated and faculty-level complaints', () => {
  test('after escalation only the Faculty Admin decides; the department can read but not decide', async () => {
    const id = await newComplaint();
    await move('hoda', id, 'ESCALATED', 'Needs a faculty-level decision.');
    await move('admin', id, 'UNDER_REVIEW');
    await move('admin', id, 'RESOLVED', 'Settled with the registry.');
    await askReopen('studenta', id);
    const requestId = await pendingId(id);

    const hod = await decide('hoda', requestId, { decision: 'APPROVE' });
    expect(hod.status).toBe(403);
    expect((await decide('officera', requestId, { decision: 'APPROVE' })).status).toBe(403);

    const res = await decide('admin', requestId, { decision: 'APPROVE', note: 'Looking at it again.' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('UNDER_REVIEW');
    expect(res.body.data.escalatedToFaculty).toBe(true); // still the faculty's case
  });

  test('faculty-level complaints: department staff cannot see or decide; the Faculty Admin does', async () => {
    const id = await newComplaint(true);
    await move('admin', id, 'UNDER_REVIEW');
    await move('admin', id, 'RESOLVED', 'Resolved by the faculty office.');
    await askReopen('studenta', id);
    const requestId = await pendingId(id);

    expect((await decide('hoda', requestId, { decision: 'APPROVE' })).status).toBe(404);
    expect((await decide('officera', requestId, { decision: 'APPROVE' })).status).toBe(404);
    expect((await decide('admin', requestId, { decision: 'REJECT', note: 'Nothing new was provided.' })).status).toBe(200);
  });
});
