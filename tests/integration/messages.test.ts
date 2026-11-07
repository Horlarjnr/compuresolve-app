import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

// Lets one test make the audit write fail, to prove a message and its notifications roll back together.
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
const DOMAIN = '@ms.invalid';
const CODES = ['MSA', 'MSB'];
const BODY = 'This is a complaint body that is long enough to pass validation.';
const REASON = 'A clear reason that the student will read.';
const INTERNAL = 'Internal note: check the lecturer before replying to the student.';
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
  await prisma.complaint.deleteMany({ where: { submittedBy: { email: { endsWith: DOMAIN } } } }); // messages cascade
  await prisma.complaintCategory.deleteMany({
    where: { OR: [{ department: { code: { in: CODES } } }, { name: { startsWith: 'MS ' } }] },
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
    title: 'Message test complaint',
    description: BODY,
  });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
};
const move = async (who: string, id: string, toStatus: string, reason?: string) => {
  const res = await post(who, `/complaints/${id}/status-transitions`, { toStatus, ...(reason ? { reason } : {}) });
  expect(res.status, `${who} -> ${toStatus}: ${JSON.stringify(res.body)}`).toBe(200);
};
const assign = async (id: string, officer: string) => {
  const res = await post('hoda', `/complaints/${id}/assignments`, { officerId: userIds[officer] });
  expect(res.status).toBe(200);
};
const say = (who: string, id: string, body: string, visibility?: string) =>
  post(who, `/complaints/${id}/messages`, { body, ...(visibility ? { visibility } : {}) });
const messageNotes = (who: string, complaintId: string) =>
  prisma.notification.findMany({ where: { userId: userIds[who], complaintId, type: 'MESSAGE_RECEIVED' } });

beforeAll(async () => {
  await cleanup();
  const a = await prisma.department.upsert({
    where: { name: 'Message Test Dept A' },
    update: { isActive: true },
    create: { name: 'Message Test Dept A', code: 'MSA' },
  });
  const b = await prisma.department.upsert({
    where: { name: 'Message Test Dept B' },
    update: { isActive: true },
    create: { name: 'Message Test Dept B', code: 'MSB' },
  });
  deptA = a.id;
  deptB = b.id;
  catA = (await prisma.complaintCategory.create({ data: { name: 'MS Cat A', scope: 'DEPARTMENT', departmentId: deptA } })).id;
  catF = (await prisma.complaintCategory.create({ data: { name: 'MS Faculty Cat', scope: 'FACULTY' } })).id;

  const passwordHash = await hashPassword(PASSWORD);
  const make = async (name: string, extra: Record<string, unknown>) => {
    const u = await prisma.user.create({
      data: { fullName: name, email: e(name), passwordHash, emailVerifiedAt: new Date(), ...extra },
    });
    userIds[name] = u.id;
  };
  const role = (departmentId: string, r: string) => ({ memberships: { create: { departmentId, role: r } } });
  const student = (n: number) => ({
    matricNumber: `MSG/1000/00${n}`,
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
  flags.failAudit = false;
  await cleanup();
  await prisma.department.deleteMany({ where: { code: { in: CODES } } });
  await prisma.$disconnect();
});

describe('the student writing to staff', () => {
  test('posts on their own open complaint; the record and the notifications are right', async () => {
    const id = await newComplaint();
    await assign(id, 'officera');

    const res = await say('studenta', id, 'I have attached my receipt number: 12345.');
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ body: 'I have attached my receipt number: 12345.', senderRole: 'STUDENT', isYou: true });
    expect(res.body.data).not.toHaveProperty('visibility');
    expect(res.body.data).not.toHaveProperty('sender');

    const row = await prisma.complaintMessage.findFirstOrThrow({ where: { complaintId: id } });
    expect(row).toMatchObject({ senderId: userIds.studenta, visibility: 'STUDENT_AND_STAFF' });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: row.id, action: 'complaint.message_posted' } });
    expect(JSON.stringify(audit.metadata)).not.toContain('receipt'); // the text is never copied into the audit log

    // the assigned Officer and the HOD are told; an unassigned Officer, the other department and the admin are not
    expect(await messageNotes('officera', id)).toHaveLength(1);
    expect(await messageNotes('hoda', id)).toHaveLength(1);
    for (const who of ['officera2', 'officerb', 'hodb', 'admin', 'studenta']) expect(await messageNotes(who, id), who).toHaveLength(0);
    expect((await messageNotes('hoda', id))[0].body).not.toContain('receipt');
  });

  test('with nobody assigned, the HOD and every active Officer of the department are told', async () => {
    const id = await newComplaint();
    expect((await say('studenta', id, 'Is anyone looking at this yet?')).status).toBe(201);
    for (const who of ['hoda', 'officera', 'officera2']) expect(await messageNotes(who, id), who).toHaveLength(1);
    expect(await messageNotes('officerb', id)).toHaveLength(0);
  });

  test('a student reply does not change the status (staff stay in control of the workflow)', async () => {
    const id = await newComplaint();
    await move('hoda', id, 'UNDER_REVIEW');
    await move('hoda', id, 'AWAITING_STUDENT', 'Please upload your payment receipt.');
    expect((await say('studenta', id, 'Here is the receipt number.')).status).toBe(201);
    expect((await prisma.complaint.findUniqueOrThrow({ where: { id } })).status).toBe('AWAITING_STUDENT');
  });

  test('students can write while the complaint is open or escalated, but not after it is resolved, closed or rejected', async () => {
    const open = await newComplaint();
    expect((await say('studenta', open, 'first')).status).toBe(201); // SUBMITTED
    await move('hoda', open, 'UNDER_REVIEW');
    expect((await say('studenta', open, 'second')).status).toBe(201);
    await move('hoda', open, 'ESCALATED', 'Needs a faculty-level decision.');
    expect((await say('studenta', open, 'third')).status).toBe(201);

    const resolved = await newComplaint();
    await move('hoda', resolved, 'UNDER_REVIEW');
    await move('hoda', resolved, 'RESOLVED', REASON);
    const refused = await say('studenta', resolved, 'one more thing');
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('MESSAGING_CLOSED');
    await move('hoda', resolved, 'CLOSED');
    expect((await say('studenta', resolved, 'still closed')).body.code).toBe('MESSAGING_CLOSED');

    const rejected = await newComplaint();
    await move('hoda', rejected, 'REJECTED', REASON);
    expect((await say('studenta', rejected, 'why?')).body.code).toBe('MESSAGING_CLOSED');
    expect(await prisma.complaintMessage.count({ where: { complaintId: { in: [resolved, rejected] } } })).toBe(0);
  });

  test('students cannot send internal messages, and bad input is refused', async () => {
    const id = await newComplaint();
    const internal = await say('studenta', id, 'secret', 'STAFF_ONLY');
    expect(internal.status).toBe(403);
    expect(internal.body.code).toBe('FORBIDDEN_VISIBILITY');

    expect((await say('studenta', id, '')).status).toBe(400);
    expect((await say('studenta', id, '   ')).status).toBe(400);
    expect((await say('studenta', id, 'x'.repeat(2001))).status).toBe(400);
    expect((await say('studenta', id, 'x'.repeat(2000))).status).toBe(201);
    expect((await post('studenta', `/complaints/${id}/messages`, { body: 'hi', senderId: userIds.hoda })).status).toBe(400);
    expect((await post('studenta', `/complaints/${id}/messages`, { body: 'hi', visibility: 'EVERYONE' })).status).toBe(400);
    expect(await prisma.complaintMessage.count({ where: { complaintId: id } })).toBe(1); // only the 2000-character one
  });
});

describe('staff writing', () => {
  test('the assigned Officer writes to the student: the student sees "STAFF", never a name, and is notified', async () => {
    const id = await newComplaint();
    await assign(id, 'officera');
    const res = await say('officera', id, 'We have contacted the lecturer about your result.');
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ visibility: 'STUDENT_AND_STAFF', senderRole: 'STAFF', sender: { fullName: 'officera' } });

    const student = await get('studenta', `/complaints/${id}/messages`);
    expect(student.status).toBe(200);
    expect(student.body.data).toHaveLength(1);
    expect(student.body.data[0]).toMatchObject({ senderRole: 'STAFF', isYou: false });
    expect(JSON.stringify(student.body)).not.toContain('officera'); // no staff identity
    expect(student.body.data[0]).not.toHaveProperty('sender');
    expect(student.body.data[0]).not.toHaveProperty('visibility');

    expect(await messageNotes('studenta', id)).toHaveLength(1);
    expect(await messageNotes('officera', id)).toHaveLength(0); // not told about their own message
  });

  test('the HOD needs no assignment; an unassigned Officer cannot post but can read', async () => {
    const id = await newComplaint();
    expect((await say('hoda', id, 'The department is looking into this.')).status).toBe(201);

    const refused = await say('officera', id, 'I would like to help');
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('NOT_ASSIGNED');
    expect((await get('officera', `/complaints/${id}/messages`)).status).toBe(200);
  });

  test('everyone else is kept out: other departments, the admin on an ordinary complaint, classmates, signed-out users', async () => {
    const id = await newComplaint();
    await say('hoda', id, 'hello');
    const missing = await get('officerb', '/complaints/00000000-0000-4000-8000-000000000000/messages');
    expect(missing.status).toBe(404);
    for (const who of ['officerb', 'hodb', 'admin', 'studenta2']) {
      const read = await get(who, `/complaints/${id}/messages`);
      const write = await say(who, id, 'let me in');
      expect(read.status, `${who} read`).toBe(404);
      expect(write.status, `${who} write`).toBe(404);
      expect(read.body.message).toBe(missing.body.message);
    }
    expect((await request(app).get(`/api/v1/complaints/${id}/messages`)).status).toBe(401);
    expect((await request(app).post(`/api/v1/complaints/${id}/messages`).send({ body: 'x' })).status).toBe(401);
    expect((await get('hoda', '/complaints/not-a-uuid/messages')).status).toBe(400);
    expect(await prisma.complaintMessage.count({ where: { complaintId: id } })).toBe(1);
  });
});

describe('internal staff messages', () => {
  test('students never see them, never count them, and are never notified about them', async () => {
    const id = await newComplaint();
    await assign(id, 'officera');
    await say('studenta', id, 'Hello, any news?');
    expect((await say('hoda', id, INTERNAL, 'STAFF_ONLY')).status).toBe(201);
    expect((await say('officera', id, 'We are checking and will update you.')).status).toBe(201);

    const student = await get('studenta', `/complaints/${id}/messages`);
    expect(student.body.meta.total).toBe(2); // the internal one is not even counted
    expect(JSON.stringify(student.body)).not.toContain('Internal note');
    expect(student.body.data.map((m: { senderRole: string }) => m.senderRole)).toEqual(['STUDENT', 'STAFF']);
    expect(await messageNotes('studenta', id)).toHaveLength(1); // only the student-visible staff message

    const staff = await get('officera', `/complaints/${id}/messages`);
    expect(staff.body.meta.total).toBe(3);
    const internal = staff.body.data.find((m: { visibility: string }) => m.visibility === 'STAFF_ONLY');
    expect(internal).toMatchObject({ body: INTERNAL, senderRole: 'STAFF', sender: { fullName: 'hoda' } });

    // unassigned department staff can read internal notes too; other departments cannot
    expect((await get('officera2', `/complaints/${id}/messages`)).body.meta.total).toBe(3);
    expect((await get('officerb', `/complaints/${id}/messages`)).status).toBe(404);
  });
});

describe('escalated and faculty-level complaints', () => {
  test('after escalation the department can read everything but not write; the Faculty Admin writes and is told', async () => {
    const id = await newComplaint();
    await say('hoda', id, INTERNAL, 'STAFF_ONLY');
    await move('hoda', id, 'ESCALATED', 'Needs a faculty-level decision.');

    expect((await get('hoda', `/complaints/${id}/messages`)).body.meta.total).toBe(1);
    for (const who of ['hoda', 'officera']) {
      const res = await say(who, id, 'can I still write?');
      expect(res.status, who).toBe(403);
    }

    expect((await say('admin', id, 'The faculty office will review this.')).status).toBe(201);
    expect((await say('admin', id, 'Internal faculty note.', 'STAFF_ONLY')).status).toBe(201);
    expect(await messageNotes('studenta', id)).toHaveLength(1); // only the student-visible one

    await say('studenta', id, 'Thank you, I will wait.');
    expect(await messageNotes('admin', id)).toHaveLength(1);
    expect(await messageNotes('hoda', id)).toHaveLength(0); // no longer the department's case
  });

  test('faculty-level complaints are invisible to department staff', async () => {
    const id = await newComplaint(true);
    expect((await say('studenta', id, 'Question for the faculty office.')).status).toBe(201);
    expect(await messageNotes('admin', id)).toHaveLength(1);
    for (const who of ['hoda', 'officera', 'officerb']) {
      expect((await get(who, `/complaints/${id}/messages`)).status).toBe(404);
      expect((await say(who, id, 'hello')).status).toBe(404);
    }
    expect((await say('admin', id, 'Received, thank you.')).status).toBe(201);
  });
});

describe('the conversation', () => {
  test('messages come back oldest first with paging', async () => {
    const id = await newComplaint();
    await say('studenta', id, 'one');
    await say('hoda', id, 'two');
    await say('studenta', id, 'three');

    const all = await get('hoda', `/complaints/${id}/messages`);
    expect(all.body.data.map((m: { body: string }) => m.body)).toEqual(['one', 'two', 'three']);

    const page2 = await get('hoda', `/complaints/${id}/messages?limit=2&page=2`);
    expect(page2.body.data.map((m: { body: string }) => m.body)).toEqual(['three']);
    expect(page2.body.meta).toMatchObject({ page: 2, limit: 2, total: 3 });
    expect((await get('hoda', `/complaints/${id}/messages?limit=1000`)).status).toBe(400);
    expect((await get('hoda', `/complaints/${id}/messages?bogus=1`)).status).toBe(400);
  });

  test('if anything fails, neither the message nor its notifications are saved', async () => {
    const id = await newComplaint();
    flags.failAudit = true;
    const res = await say('studenta', id, 'this should not be stored');
    flags.failAudit = false;

    expect(res.status).toBe(500);
    expect(await prisma.complaintMessage.count({ where: { complaintId: id } })).toBe(0);
    expect(await prisma.notification.count({ where: { complaintId: id, type: 'MESSAGE_RECEIVED' } })).toBe(0);
    expect((await say('studenta', id, 'and it works afterwards')).status).toBe(201);
  });
});
