import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

// Lets one test make the audit write fail, to prove notifications roll back with the event.
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
const DOMAIN = '@nt.invalid';
const CODES = ['NTA', 'NTB'];
const BODY = 'This is a complaint body that is long enough to pass validation.';
const SECRET_REASON = 'confidential-reason-text-should-never-appear-in-notifications';
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
    where: { OR: [{ department: { code: { in: CODES } } }, { name: { startsWith: 'NT ' } }] },
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
const patch = (who: string, path: string) => request(app).patch(`/api/v1${path}`).set('Cookie', cookies[who]);

const newComplaint = async (faculty = false) => {
  const res = await post('studenta', '/complaints', {
    ...(faculty ? { target: 'FACULTY', categoryId: catF } : { categoryId: catA }),
    title: 'Notification test complaint',
    description: BODY,
  });
  expect(res.status).toBe(201);
  return { id: res.body.data.id as string, reference: res.body.data.reference as string };
};
const move = async (who: string, id: string, toStatus: string, reason?: string) => {
  const res = await post(who, `/complaints/${id}/status-transitions`, { toStatus, ...(reason ? { reason } : {}) });
  expect(res.status, `${who} -> ${toStatus}: ${JSON.stringify(res.body)}`).toBe(200);
};
const notesFor = (who: string, complaintId: string) =>
  prisma.notification.findMany({ where: { userId: userIds[who], complaintId }, orderBy: { createdAt: 'asc' } });
const types = async (who: string, id: string) => (await notesFor(who, id)).map((n) => n.type);

beforeAll(async () => {
  await cleanup();
  const a = await prisma.department.upsert({
    where: { name: 'Notification Test Dept A' },
    update: { isActive: true },
    create: { name: 'Notification Test Dept A', code: 'NTA' },
  });
  const b = await prisma.department.upsert({
    where: { name: 'Notification Test Dept B' },
    update: { isActive: true },
    create: { name: 'Notification Test Dept B', code: 'NTB' },
  });
  deptA = a.id;
  deptB = b.id;
  catA = (await prisma.complaintCategory.create({ data: { name: 'NT Cat A', scope: 'DEPARTMENT', departmentId: deptA } })).id;
  catF = (await prisma.complaintCategory.create({ data: { name: 'NT Faculty Cat', scope: 'FACULTY' } })).id;

  const passwordHash = await hashPassword(PASSWORD);
  const make = async (name: string, extra: Record<string, unknown>) => {
    const u = await prisma.user.create({
      data: { fullName: name, email: e(name), passwordHash, emailVerifiedAt: new Date(), ...extra },
    });
    userIds[name] = u.id;
  };
  const role = (departmentId: string, r: string, status = 'ACTIVE') => ({
    memberships: { create: { departmentId, role: r, status } },
  });
  await make('studenta', { matricNumber: 'NTF/1000/001', studentProfile: { create: { level: 'L200' } }, ...role(deptA, 'STUDENT') });
  await make('officera', role(deptA, 'OFFICER'));
  await make('officera2', role(deptA, 'OFFICER'));
  await make('officersusp', role(deptA, 'OFFICER', 'SUSPENDED')); // must never be notified
  await make('hoda', role(deptA, 'HOD'));
  await make('officerb', role(deptB, 'OFFICER'));
  await make('hodb', role(deptB, 'HOD'));
  await make('admin', { facultyRoles: { create: { role: 'FACULTY_ADMIN' } } });
  await make('admin2', { facultyRoles: { create: { role: 'FACULTY_ADMIN' } } });
  for (const n of ['studenta', 'officera', 'officera2', 'hoda', 'officerb', 'hodb', 'admin', 'admin2']) {
    cookies[n] = await login(n);
  }
}, 600_000);

afterAll(async () => {
  flags.failAudit = false;
  await cleanup();
  await prisma.department.deleteMany({ where: { code: { in: CODES } } });
  await prisma.$disconnect();
});

describe('who is notified when a complaint is submitted', () => {
  test('a departmental complaint notifies that department\'s active HOD and Officers, and nobody else', async () => {
    const { id, reference } = await newComplaint();
    for (const who of ['hoda', 'officera', 'officera2']) {
      const notes = await notesFor(who, id);
      expect(notes, who).toHaveLength(1);
      expect(notes[0]).toMatchObject({ type: 'COMPLAINT_SUBMITTED', complaintId: id, readAt: null });
      expect(notes[0].body).toContain(reference);
    }
    for (const who of ['studenta', 'officersusp', 'officerb', 'hodb', 'admin', 'admin2']) {
      expect(await notesFor(who, id), who).toHaveLength(0);
    }
  });

  test('a faculty-level complaint notifies the Faculty Admins only', async () => {
    const { id } = await newComplaint(true);
    expect(await types('admin', id)).toEqual(['COMPLAINT_SUBMITTED']);
    expect(await types('admin2', id)).toEqual(['COMPLAINT_SUBMITTED']);
    for (const who of ['hoda', 'officera', 'officerb', 'studenta']) expect(await notesFor(who, id)).toHaveLength(0);
  });
});

describe('assignment', () => {
  test('the HOD assigning notifies the Officer; an Officer claiming their own complaint notifies nobody', async () => {
    const { id } = await newComplaint();
    expect((await post('hoda', `/complaints/${id}/assignments`, { officerId: userIds.officera })).status).toBe(200);
    expect(await types('officera', id)).toEqual(['COMPLAINT_SUBMITTED', 'COMPLAINT_ASSIGNED']);
    expect(await types('studenta', id)).toEqual([]); // staff assignment is not shown to the student

    const { id: other } = await newComplaint();
    expect((await post('officera2', `/complaints/${other}/assignments`, { officerId: userIds.officera2 })).status).toBe(200);
    expect(await types('officera2', other)).toEqual(['COMPLAINT_SUBMITTED']); // no "assigned to you" for a self-claim
  });
});

describe('status changes', () => {
  test('the student is told about each change with generic text; reasons never appear in notifications', async () => {
    const { id, reference } = await newComplaint();
    await move('hoda', id, 'UNDER_REVIEW');
    await move('hoda', id, 'AWAITING_STUDENT', SECRET_REASON);
    await move('hoda', id, 'RESOLVED', SECRET_REASON);

    const notes = await notesFor('studenta', id);
    expect(notes.map((n) => n.type)).toEqual(['STATUS_CHANGED', 'STATUS_CHANGED', 'COMPLAINT_RESOLVED']);
    expect(notes[0].body).toBe(`Complaint ${reference} is now under review.`);
    expect(notes[1].body).toContain('awaiting student');
    for (const n of notes) {
      expect(n.title + n.body).not.toContain(SECRET_REASON);
    }
    // the person who made the change is not notified about their own action
    expect((await types('hoda', id)).filter((t) => t !== 'COMPLAINT_SUBMITTED')).toEqual([]);
  });

  test('escalation tells the student and every Faculty Admin', async () => {
    const { id } = await newComplaint();
    await move('hoda', id, 'ESCALATED', SECRET_REASON);
    expect(await types('studenta', id)).toEqual(['COMPLAINT_ESCALATED']);
    expect(await types('admin', id)).toEqual(['COMPLAINT_ESCALATED']);
    expect(await types('admin2', id)).toEqual(['COMPLAINT_ESCALATED']);
    expect(await notesFor('officerb', id)).toHaveLength(0);
  });

  test('refused actions create no notifications', async () => {
    const { id } = await newComplaint();
    const before = await prisma.notification.count({ where: { complaintId: id } });
    expect((await post('officera', `/complaints/${id}/status-transitions`, { toStatus: 'UNDER_REVIEW' })).status).toBe(403); // not assigned
    expect((await post('hodb', `/complaints/${id}/status-transitions`, { toStatus: 'UNDER_REVIEW' })).status).toBe(404);
    expect(await prisma.notification.count({ where: { complaintId: id } })).toBe(before);
  });

  test('if the change fails, its notifications are not saved either (all or nothing)', async () => {
    const { id } = await newComplaint();
    const before = await prisma.notification.count({ where: { complaintId: id } });
    flags.failAudit = true;
    const res = await post('hoda', `/complaints/${id}/status-transitions`, { toStatus: 'UNDER_REVIEW' });
    flags.failAudit = false;
    expect(res.status).toBe(500);
    expect(await prisma.notification.count({ where: { complaintId: id } })).toBe(before);
    expect(await types('studenta', id)).toEqual([]);
  });
});

describe('reopen requests', () => {
  test('a request notifies the HOD and the assigned Officer; the decision notifies the student', async () => {
    const { id } = await newComplaint();
    await post('hoda', `/complaints/${id}/assignments`, { officerId: userIds.officera });
    await move('hoda', id, 'UNDER_REVIEW');
    await move('hoda', id, 'RESOLVED', 'Resolved with a full explanation.');
    expect((await post('studenta', `/complaints/${id}/reopen-requests`, { reason: WHY })).status).toBe(201);

    expect(await types('hoda', id)).toContain('REOPEN_REQUESTED');
    expect(await types('officera', id)).toContain('REOPEN_REQUESTED');
    expect(await types('officera2', id)).not.toContain('REOPEN_REQUESTED'); // not assigned
    for (const who of ['officerb', 'hodb', 'admin']) expect(await types(who, id)).not.toContain('REOPEN_REQUESTED');

    const request = await prisma.complaintReopenRequest.findFirstOrThrow({ where: { complaintId: id, status: 'PENDING' } });
    const decision = await post('officera', `/reopen-requests/${request.id}/decision`, { decision: 'REJECT', note: SECRET_REASON });
    expect(decision.status).toBe(200);
    const notes = (await notesFor('studenta', id)).filter((n) => n.type === 'REOPEN_REQUEST_DECIDED');
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toContain('rejected');
    expect(notes[0].title + notes[0].body).not.toContain(SECRET_REASON);
  });

  test('a request on an escalated complaint notifies the Faculty Admins, not the department', async () => {
    const { id } = await newComplaint();
    await move('hoda', id, 'ESCALATED', 'Needs a faculty-level decision.');
    await move('admin', id, 'UNDER_REVIEW');
    await move('admin', id, 'RESOLVED', 'Settled with the registry.');
    expect((await post('studenta', `/complaints/${id}/reopen-requests`, { reason: WHY })).status).toBe(201);

    expect(await types('admin', id)).toContain('REOPEN_REQUESTED');
    expect(await types('admin2', id)).toContain('REOPEN_REQUESTED');
    expect(await types('hoda', id)).not.toContain('REOPEN_REQUESTED');
  });
});

describe('reading notifications', () => {
  test('you only ever see your own, newest first, with paging and an unread count', async () => {
    const { id } = await newComplaint();
    await move('hoda', id, 'UNDER_REVIEW');
    await move('hoda', id, 'IN_PROGRESS');

    const res = await get('studenta', '/notifications?limit=100');
    expect(res.status).toBe(200);
    expect(res.body.data.every((n: { id: string }) => n.id)).toBe(true);
    const mine = res.body.data.filter((n: { complaintId: string }) => n.complaintId === id);
    expect(mine).toHaveLength(2);
    expect(res.body.data[0].createdAt >= res.body.data.at(-1).createdAt).toBe(true); // newest first
    expect(res.body.meta.unread).toBeGreaterThanOrEqual(2);
    expect(Object.keys(res.body.data[0]).sort()).toEqual(['body', 'complaintId', 'createdAt', 'id', 'readAt', 'title', 'type']);

    // a staff member never sees the student's notifications
    const hod = await get('hoda', '/notifications?limit=100');
    expect(hod.body.data.map((n: { id: string }) => n.id)).not.toContain(mine[0].id);

    const paged = await get('studenta', '/notifications?limit=1&page=2');
    expect(paged.status, JSON.stringify(paged.body)).toBe(200);
    expect(paged.body.data).toHaveLength(1);
  });

  test('marking one as read works, is idempotent, and only works on your own', async () => {
    const { id } = await newComplaint();
    await move('hoda', id, 'UNDER_REVIEW');
    const note = (await notesFor('studenta', id))[0];

    const before = (await get('studenta', '/notifications?limit=1')).body.meta.unread;
    const read = await patch('studenta', `/notifications/${note.id}/read`);
    expect(read.status).toBe(200);
    expect(read.body.data.readAt).toBeTruthy();

    const again = await patch('studenta', `/notifications/${note.id}/read`);
    expect(again.status).toBe(200);
    expect(again.body.data.readAt).toBe(read.body.data.readAt); // unchanged

    const after = await get('studenta', '/notifications?unread=true&limit=100');
    expect(after.body.meta.unread).toBe(before - 1);
    expect(after.body.data.map((n: { id: string }) => n.id)).not.toContain(note.id);

    // someone else's notification looks exactly like a missing one
    const stolen = await patch('hoda', `/notifications/${note.id}/read`);
    const missing = await patch('hoda', '/notifications/00000000-0000-4000-8000-000000000000/read');
    expect(stolen.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(stolen.body.message).toBe(missing.body.message);
  });

  test('signed-out users are refused and bad input fails', async () => {
    expect((await request(app).get('/api/v1/notifications')).status).toBe(401);
    expect((await request(app).patch('/api/v1/notifications/00000000-0000-4000-8000-000000000000/read')).status).toBe(401);
    expect((await patch('studenta', '/notifications/not-a-uuid/read')).status).toBe(400);
    expect((await get('studenta', '/notifications?bogus=1')).status).toBe(400);
    expect((await get('studenta', '/notifications?limit=1000')).status).toBe(400);
  });
});
