import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import app from '../../src/app';
import { hashPassword } from '../../src/utils/password';
import { prisma } from '../../src/utils/prisma';

// Privacy acceptance criterion: API responses do not leak password hashes, secrets or internal details.
// Every readable endpoint is called as every kind of user, and every response body is scanned.

const PASSWORD = 'Str0ng!Pass#';
const DOMAIN = '@pl.invalid';
const CODES = ['PLA', 'PLB'];
const e = (name: string) => `${name}${DOMAIN}`;

// Things that must NEVER appear in any response body.
const SECRETS = /passwordHash|tokenHash|\$2[aby]\$\d\d\$|"token"\s*:|"sid"\s*:|SMTP_PASS|DATABASE_URL|postgres(ql)?:\/\//i;
// Things that must never appear in an ERROR body (internals).
const INTERNALS = /node_modules|prisma\.[a-z]+\.|\bat\s+\S+\s+\(|\.ts:\d+|ECONNREFUSED|stack/i;

const cookies: Record<string, string> = {};
const ids: Record<string, string> = {};
let deptA = '';

const cleanup = async () => {
  await prisma.auditLog.deleteMany({ where: { OR: [{ actor: { email: { endsWith: DOMAIN } } }, { department: { code: { in: CODES } } }] } });
  await prisma.staffInvitation.deleteMany({ where: { invitedBy: { email: { endsWith: DOMAIN } } } });
  await prisma.complaint.deleteMany({ where: { submittedBy: { email: { endsWith: DOMAIN } } } });
  await prisma.complaintCategory.deleteMany({ where: { OR: [{ department: { code: { in: CODES } } }, { name: { startsWith: 'PL ' } }] } });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
};

const login = async (name: string) => {
  const res = await request(app).post('/api/v1/auth/login').send({ email: e(name), password: PASSWORD });
  expect(JSON.stringify(res.body)).not.toMatch(SECRETS); // the login response itself
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('sid='))!.split(';')[0];
};

beforeAll(async () => {
  await cleanup();
  const a = await prisma.department.upsert({ where: { name: 'Privacy Test Dept A' }, update: { isActive: true }, create: { name: 'Privacy Test Dept A', code: 'PLA' } });
  const b = await prisma.department.upsert({ where: { name: 'Privacy Test Dept B' }, update: { isActive: true }, create: { name: 'Privacy Test Dept B', code: 'PLB' } });
  deptA = a.id;
  const catA = await prisma.complaintCategory.create({ data: { name: 'PL Cat A', scope: 'DEPARTMENT', departmentId: a.id } });

  const passwordHash = await hashPassword(PASSWORD);
  const make = async (name: string, extra: Record<string, unknown>) => {
    const u = await prisma.user.create({ data: { fullName: name, email: e(name), passwordHash, emailVerifiedAt: new Date(), ...extra } });
    ids[name] = u.id;
  };
  const role = (departmentId: string, r: string) => ({ memberships: { create: { departmentId, role: r } } });
  await make('studenta', { matricNumber: 'PLK/1000/001', studentProfile: { create: { level: 'L200' } }, ...role(a.id, 'STUDENT') });
  await make('studentb', { matricNumber: 'PLK/1000/002', studentProfile: { create: { level: 'L200' } }, ...role(b.id, 'STUDENT') });
  await make('officera', role(a.id, 'OFFICER'));
  await make('hoda', role(a.id, 'HOD'));
  await make('hodb', role(b.id, 'HOD'));
  await make('admin', { facultyRoles: { create: { role: 'FACULTY_ADMIN' } } });

  const c = await prisma.complaint.create({
    data: {
      reference: 'PL-1', title: 'Privacy complaint', description: 'A complaint body for the privacy scan.', scope: 'DEPARTMENT',
      departmentId: a.id, submittedById: ids.studenta, categoryId: catA.id, status: 'RESOLVED', assignedToId: ids.officera,
      statusHistory: { create: [{ actorId: ids.studenta, fromStatus: null, toStatus: 'SUBMITTED' }, { actorId: ids.hoda, fromStatus: 'SUBMITTED', toStatus: 'RESOLVED', reason: 'Done.' }] },
    },
  });
  ids.complaint = c.id;
  await prisma.complaintMessage.createMany({
    data: [
      { complaintId: c.id, senderId: ids.studenta, body: 'Student message' },
      { complaintId: c.id, senderId: ids.officera, body: 'Staff reply' },
      { complaintId: c.id, senderId: ids.hoda, body: 'Internal staff note', visibility: 'STAFF_ONLY' },
    ],
  });
  await prisma.complaintReopenRequest.create({ data: { complaintId: c.id, requesterId: ids.studenta, reason: 'Please reopen this.' } });
  await prisma.notification.create({ data: { userId: ids.studenta, type: 'STATUS_CHANGED', title: 'Update', body: 'PL-1 updated', complaintId: c.id } });
  await prisma.staffInvitation.create({
    data: { email: `invitee${DOMAIN}`, requestedRole: 'OFFICER', departmentId: a.id, tokenHash: 'pl-invite-token-hash', expiresAt: new Date(Date.now() + 86_400_000), invitedById: ids.admin },
  });

  for (const n of ['studenta', 'studentb', 'officera', 'hoda', 'hodb', 'admin']) cookies[n] = await login(n);
}, 600_000);

afterAll(async () => {
  await cleanup();
  await prisma.department.deleteMany({ where: { code: { in: CODES } } });
  await prisma.$disconnect();
});

const common = () => [
  '/auth/me', '/notifications', '/dashboard/summary', '/categories', '/departments',
  '/complaints?limit=100', `/complaints/${ids.complaint}`, `/complaints/${ids.complaint}/messages`, '/reopen-requests',
];
const paths: Record<string, () => string[]> = {
  studenta: common,
  studentb: common,
  officera: common,
  hoda: () => [...common(), `/departments/${deptA}/members`, '/invitations'],
  hodb: common,
  admin: () => [...common(), '/departments/all', '/invitations', `/departments/${deptA}/members`],
};

describe('no response ever contains secrets', () => {
  for (const who of Object.keys(paths)) {
    test(`${who}: every readable endpoint is clean`, async () => {
      for (const path of paths[who]()) {
        const res = await request(app).get(`/api/v1${path}`).set('Cookie', cookies[who]);
        expect(res.status, `${who} GET ${path}`).toBeLessThan(500);
        expect(JSON.stringify(res.body), `${who} GET ${path}`).not.toMatch(SECRETS);
      }
    });
  }

  test('the invitation list shows no token or hash, and the members list no password data', async () => {
    const inv = await request(app).get('/api/v1/invitations').set('Cookie', cookies.admin);
    expect(inv.body.data.length).toBeGreaterThan(0);
    expect(Object.keys(inv.body.data[0]).sort()).toEqual(['createdAt', 'department', 'email', 'expiresAt', 'id', 'invitedBy', 'role', 'status']);
    const members = await request(app).get(`/api/v1/departments/${deptA}/members`).set('Cookie', cookies.hoda);
    for (const m of members.body.data) expect(Object.keys(m.user).sort()).toEqual(['email', 'fullName', 'id']);
  });
});

describe('students never see other people\'s details', () => {
  test('studentb sees nothing of department A or of studenta', async () => {
    for (const path of common()) {
      const res = await request(app).get(`/api/v1${path}`).set('Cookie', cookies.studentb);
      const text = JSON.stringify(res.body);
      expect(text, path).not.toContain('PL-1');
      expect(text, path).not.toContain('studenta');
      expect(text, path).not.toContain('PLK/1000/001');
    }
  });

  test('studenta never sees staff names, internal notes or other users\' emails', async () => {
    for (const path of common()) {
      const res = await request(app).get(`/api/v1${path}`).set('Cookie', cookies.studenta);
      const text = JSON.stringify(res.body);
      expect(text, path).not.toContain('Internal staff note');
      expect(text, path).not.toContain('officera');
      expect(text, path).not.toContain('hoda');
      expect(text, path).not.toMatch(/studentb|hodb|admin@/);
    }
  });
});

describe('error responses reveal no internals', () => {
  test('not found, validation, forbidden, malformed JSON and wrong credentials are all clean', async () => {
    const bodies = [
      (await request(app).get('/api/v1/complaints/00000000-0000-4000-8000-000000000000').set('Cookie', cookies.studenta)).body,
      (await request(app).get('/api/v1/complaints/not-a-uuid').set('Cookie', cookies.studenta)).body,
      (await request(app).post('/api/v1/complaints').set('Cookie', cookies.officera).send({})).body,
      (await request(app).post('/api/v1/complaints').set('Cookie', cookies.studenta).send({ title: 1, extra: true })).body,
      (await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"broken":')).body,
      (await request(app).post('/api/v1/auth/login').send({ email: e('studenta'), password: 'Wrong!Pass123' })).body,
      (await request(app).get('/api/v1/nothing-here')).body,
    ];
    for (const body of bodies) {
      expect(body.success).toBe(false);
      const text = JSON.stringify(body);
      expect(text).not.toMatch(INTERNALS);
      expect(text).not.toMatch(SECRETS);
    }
  });
});
