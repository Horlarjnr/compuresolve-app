import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import app from '../../src/app';
import { hashPassword } from '../../src/utils/password';
import { prisma } from '../../src/utils/prisma';

const PASSWORD = 'Str0ng!Pass#';
const DOMAIN = '@cmp.invalid';
const CODES = ['CPA', 'CPB'];
const e = (name: string) => `${name}${DOMAIN}`;
const BODY = 'This is a complaint body that is long enough to pass validation.';

let deptA = '';
let deptB = '';
let catA = '';
let catAOther = '';
let catB = '';
let catF = '';
let catInactive = '';
const cookies: Record<string, string> = {};
const ids: Record<string, string> = {}; // label -> complaint id
const refs: Record<string, string> = {}; // label -> reference

const cleanup = async () => {
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actor: { email: { endsWith: DOMAIN } } }, { department: { code: { in: CODES } } }] },
  });
  await prisma.complaint.deleteMany({ where: { submittedBy: { email: { endsWith: DOMAIN } } } });
  await prisma.complaintCategory.deleteMany({
    where: { OR: [{ department: { code: { in: CODES } } }, { name: { startsWith: 'CP ' } }] },
  });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
};

const login = async (name: string) => {
  const res = await request(app).post('/api/v1/auth/login').send({ email: e(name), password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('sid='))!.split(';')[0];
};

const get = (who: string, path: string) => request(app).get(`/api/v1${path}`).set('Cookie', cookies[who]);
const submit = (who: string, body: object) =>
  request(app).post('/api/v1/complaints').set('Cookie', cookies[who]).send(body);

const mine = (overrides: Record<string, unknown> = {}) => ({
  categoryId: catA,
  title: 'Missing exam result',
  description: BODY,
  ...overrides,
});

const labelsOf = (res: request.Response) => {
  const byId = Object.fromEntries(Object.entries(ids).map(([label, id]) => [id, label]));
  return res.body.data.map((c: { id: string }) => byId[c.id] ?? 'UNKNOWN').sort();
};

beforeAll(async () => {
  await cleanup();
  const a = await prisma.department.upsert({
    where: { name: 'Complaint Test Dept A' },
    update: { isActive: true },
    create: { name: 'Complaint Test Dept A', code: 'CPA' },
  });
  const b = await prisma.department.upsert({
    where: { name: 'Complaint Test Dept B' },
    update: { isActive: true },
    create: { name: 'Complaint Test Dept B', code: 'CPB' },
  });
  deptA = a.id;
  deptB = b.id;

  const cat = (name: string, data: Record<string, unknown>) =>
    prisma.complaintCategory.create({ data: { name, ...data } as never });
  catA = (await cat('CP Cat A', { scope: 'DEPARTMENT', departmentId: deptA })).id;
  catAOther = (await cat('CP Cat A Other', { scope: 'DEPARTMENT', departmentId: deptA })).id;
  catB = (await cat('CP Cat B', { scope: 'DEPARTMENT', departmentId: deptB })).id;
  catF = (await cat('CP Faculty Cat', { scope: 'FACULTY' })).id;
  catInactive = (await cat('CP Inactive Cat', { scope: 'DEPARTMENT', departmentId: deptA, isActive: false })).id;

  const passwordHash = await hashPassword(PASSWORD);
  const make = (name: string, extra: Record<string, unknown>) =>
    prisma.user.create({ data: { fullName: name, email: e(name), passwordHash, emailVerifiedAt: new Date(), ...extra } });
  const role = (departmentId: string, r: string) => ({ memberships: { create: { departmentId, role: r } } });
  const student = (departmentId: string, n: number) => ({
    matricNumber: `CMP/1000/00${n}`,
    studentProfile: { create: { level: 'L200' } },
    ...role(departmentId, 'STUDENT'),
  });

  await make('studenta1', student(deptA, 1));
  await make('studenta2', student(deptA, 2));
  await make('studentb', student(deptB, 3));
  await make('officera', role(deptA, 'OFFICER'));
  await make('hoda', role(deptA, 'HOD'));
  await make('officerb', role(deptB, 'OFFICER'));
  await make('hodb', role(deptB, 'HOD'));
  await make('admin', { facultyRoles: { create: { role: 'FACULTY_ADMIN' } } });
  await make('nobody', {});
  for (const n of ['studenta1', 'studenta2', 'studentb', 'officera', 'hoda', 'officerb', 'hodb', 'admin', 'nobody']) {
    cookies[n] = await login(n);
  }

  // The data every list/detail test relies on, created through the real endpoint.
  const make5 = async (label: string, who: string, body: object) => {
    const res = await submit(who, body);
    expect(res.status, `creating ${label}`).toBe(201);
    ids[label] = res.body.data.id;
    refs[label] = res.body.data.reference;
  };
  await make5('cA1', 'studenta1', mine({ title: 'Complaint A one' }));
  await make5('cA2', 'studenta2', mine({ title: 'Complaint A two', categoryId: catAOther }));
  await make5('cB1', 'studentb', mine({ categoryId: catB, title: 'Complaint B one' }));
  await make5('cF', 'studenta1', mine({ target: 'FACULTY', categoryId: catF, title: 'Faculty level complaint' }));
  await make5('cEsc', 'studentb', mine({ categoryId: catB, title: 'Escalated B complaint' }));
  await prisma.complaint.update({
    where: { id: ids.cEsc },
    data: { escalatedToFaculty: true, escalatedAt: new Date(), status: 'ESCALATED' },
  });
}, 600_000);

afterAll(async () => {
  await cleanup();
  await prisma.department.deleteMany({ where: { code: { in: CODES } } });
  await prisma.$disconnect();
});

describe('submitting a complaint', () => {
  test('creates it in the student\'s own department with a reference and a first history row', async () => {
    const res = await submit('studenta1', mine({ title: 'Check the stored data' }));
    expect(res.status).toBe(201);
    expect(res.body.data.reference).toMatch(/^CR-CPA-\d{4}-[A-Z2-9]{6}$/);
    expect(res.body.data.status).toBe('SUBMITTED');
    expect(res.body.data.department.id).toBe(deptA);

    const row = await prisma.complaint.findUniqueOrThrow({
      where: { id: res.body.data.id },
      include: { statusHistory: true, submittedBy: true },
    });
    expect(row.submittedBy.email).toBe(e('studenta1'));
    expect(row.scope).toBe('DEPARTMENT');
    expect(row.departmentId).toBe(deptA);
    expect(row.priority).toBe('NORMAL');
    expect(row.assignedToId).toBeNull();
    expect(row.statusHistory).toHaveLength(1);
    expect(row.statusHistory[0]).toMatchObject({ fromStatus: null, toStatus: 'SUBMITTED', actorId: row.submittedById });
    expect(await prisma.auditLog.count({ where: { entityId: row.id, action: 'complaint.submitted' } })).toBe(1);
  });

  test('the student view hides staff identities and routing details', async () => {
    const res = await submit('studenta1', mine({ title: 'Student view check' }));
    expect(res.body.data).not.toHaveProperty('assignedTo');
    expect(res.body.data).not.toHaveProperty('submittedBy');
    expect(res.body.data).not.toHaveProperty('escalatedToFaculty');
    expect(res.body.data.assigned).toBe(false);
    expect(res.body.data.statusHistory[0]).not.toHaveProperty('actor');
  });

  test('a faculty-level complaint has no department and a FAC reference', async () => {
    const res = await submit('studenta2', mine({ target: 'FACULTY', categoryId: catF }));
    expect(res.status).toBe(201);
    expect(res.body.data.scope).toBe('FACULTY');
    expect(res.body.data.department).toBeNull();
    expect(res.body.data.reference).toMatch(/^CR-FAC-/);
  });

  test('only the own department is allowed, even if the client names another one', async () => {
    const before = await prisma.complaint.count({ where: { submittedBy: { email: e('studenta1') } } });
    const other = await submit('studenta1', mine({ departmentId: deptB, categoryId: catB }));
    expect(other.status).toBe(403);
    expect(other.body.code).toBe('FORBIDDEN_DEPARTMENT');
    expect(await prisma.complaint.count({ where: { submittedBy: { email: e('studenta1') } } })).toBe(before);

    expect((await submit('studenta1', mine({ departmentId: deptA }))).status).toBe(201); // naming your own is fine
  });

  test('the category must be active and match the chosen target', async () => {
    expect((await submit('studenta1', mine({ categoryId: catB }))).body.code).toBe('INVALID_CATEGORY'); // other department
    expect((await submit('studenta1', mine({ categoryId: catInactive }))).body.code).toBe('INVALID_CATEGORY');
    expect((await submit('studenta1', mine({ categoryId: catF }))).body.code).toBe('INVALID_CATEGORY'); // faculty cat, department target
    expect((await submit('studenta1', mine({ target: 'FACULTY' }))).body.code).toBe('INVALID_CATEGORY'); // dept cat, faculty target
    expect((await submit('studenta1', mine({ categoryId: '00000000-0000-4000-8000-000000000000' }))).status).toBe(400);
  });

  test.each([
    ['submittedById', { submittedById: '00000000-0000-4000-8000-000000000000' }],
    ['status', { status: 'RESOLVED' }],
    ['priority', { priority: 'URGENT' }],
    ['assignedToId', { assignedToId: '00000000-0000-4000-8000-000000000000' }],
    ['scope', { scope: 'FACULTY' }],
    ['reference', { reference: 'CR-HACK-2026-AAAAAA' }],
    ['faculty target with a department', { target: 'FACULTY', departmentId: '00000000-0000-4000-8000-000000000000' }],
  ])('rejects client-supplied %s', async (_label, extra) => {
    const before = await prisma.complaint.count();
    const res = await submit('studenta1', { ...mine(), ...extra });
    expect(res.status).toBe(400);
    expect(await prisma.complaint.count()).toBe(before);
  });

  test('rejects short or missing text', async () => {
    expect((await submit('studenta1', mine({ title: 'abc' }))).status).toBe(400);
    expect((await submit('studenta1', mine({ description: 'too short' }))).status).toBe(400);
    expect((await submit('studenta1', { title: 'No category here', description: BODY })).status).toBe(400);
  });

  test('staff, the Faculty Admin and signed-out users cannot submit', async () => {
    for (const who of ['officera', 'hoda', 'admin']) expect((await submit(who, mine())).status).toBe(403);
    expect((await request(app).post('/api/v1/complaints').send(mine())).status).toBe(401);
  });

  test('every reference is unique', async () => {
    const results = await Promise.all([1, 2, 3].map((n) => submit('studenta2', mine({ title: `Unique check ${n}` }))));
    const references = results.map((r) => r.body.data.reference);
    expect(new Set(references).size).toBe(3);
  });
});

describe('who sees which complaints (over HTTP)', () => {
  test.each([
    ['studenta2', ['cA2']],
    ['studentb', ['cB1', 'cEsc']],
    ['officera', ['cA1', 'cA2']],
    ['hodb', ['cB1', 'cEsc']],
    ['officerb', ['cB1', 'cEsc']],
    ['admin', ['cEsc', 'cF']], // faculty-level + escalated only
    ['nobody', []],
  ])('%s lists %j (restricted to the seeded labels)', async (who, expected) => {
    const res = await get(who, '/complaints?limit=100&q=Complaint');
    expect(res.status).toBe(200);
    const seen = labelsOf(res).filter((l: string) => l !== 'UNKNOWN');
    expect(seen).toEqual([...expected].sort());
  });

  test('studenta1 lists exactly their own complaints (never a classmate\'s)', async () => {
    const res = await get('studenta1', '/complaints?limit=100');
    const seen = labelsOf(res).filter((l: string) => l !== 'UNKNOWN');
    expect(seen).toEqual(['cA1', 'cF']);
    expect(res.body.data.every((c: { id: string }) => c.id !== ids.cA2)).toBe(true);
  });

  test('a department filter for a department you cannot see returns nothing, not an error or a leak', async () => {
    const res = await get('officera', `/complaints?departmentId=${deptB}&limit=100`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.total).toBe(0);
  });

  test('filters and paging narrow the visible set', async () => {
    const byStatus = await get('admin', '/complaints?status=ESCALATED');
    expect(labelsOf(byStatus).filter((l: string) => l !== 'UNKNOWN')).toEqual(['cEsc']);

    const byRef = await get('officera', `/complaints?q=${refs.cA1}`);
    expect(labelsOf(byRef)).toEqual(['cA1']);

    const byCategory = await get('officera', `/complaints?categoryId=${catAOther}`);
    expect(labelsOf(byCategory).filter((l: string) => l !== 'UNKNOWN')).toEqual(['cA2']);

    const paged = await get('officera', '/complaints?limit=1&page=2');
    expect(paged.status, `paged response: ${JSON.stringify(paged.body)}`).toBe(200); // shows the real error if it fails
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta.total).toBeGreaterThanOrEqual(2);
    expect((await get('officera', '/complaints?limit=1000')).status).toBe(400);
    expect((await get('officera', '/complaints?role=HOD')).status).toBe(400);
  });

  test('staff list items show the submitter and assignee; student items do not', async () => {
    const staff = await get('officera', `/complaints?q=${refs.cA1}`);
    expect(staff.body.data[0].submittedBy).toMatchObject({ fullName: 'studenta1', matricNumber: 'CMP/1000/001' });
    expect(staff.body.data[0]).toHaveProperty('assignedTo');

    const student = await get('studenta1', `/complaints?q=${refs.cA1}`);
    expect(student.body.data[0]).not.toHaveProperty('submittedBy');
    expect(student.body.data[0]).not.toHaveProperty('assignedTo');
  });
});

describe('opening one complaint', () => {
  test('people who may see it get 200', async () => {
    const allowed: [string, string][] = [
      ['studenta1', 'cA1'],
      ['officera', 'cA1'],
      ['hoda', 'cA2'],
      ['studentb', 'cEsc'],
      ['hodb', 'cEsc'], // the department keeps read access after escalation
      ['admin', 'cEsc'],
      ['admin', 'cF'],
    ];
    for (const [who, label] of allowed) {
      const res = await get(who, `/complaints/${ids[label]}`);
      expect(res.status, `${who} -> ${label}`).toBe(200);
    }
  });

  test('everyone else gets the same 404 as for a complaint that does not exist (ID guessing fails)', async () => {
    const denied: [string, string][] = [
      ['studenta2', 'cA1'], // classmate
      ['studentb', 'cA1'], // other department
      ['officera', 'cB1'], // other department staff
      ['hoda', 'cB1'],
      ['hoda', 'cF'], // department HOD, faculty-level complaint
      ['officera', 'cF'],
      ['admin', 'cA1'], // admin, ordinary departmental complaint
      ['admin', 'cB1'],
      ['nobody', 'cA1'],
    ];
    const missing = await get('officera', '/complaints/00000000-0000-4000-8000-000000000000');
    expect(missing.status).toBe(404);
    for (const [who, label] of denied) {
      const res = await get(who, `/complaints/${ids[label]}`);
      expect(res.status, `${who} -> ${label}`).toBe(404);
      expect(res.body.message).toBe(missing.body.message);
    }
    expect((await request(app).get(`/api/v1/complaints/${ids.cA1}`)).status).toBe(401);
    expect((await get('officera', '/complaints/not-a-uuid')).status).toBe(400);
  });

  test('the detail view differs for the submitter and for staff', async () => {
    const student = await get('studenta1', `/complaints/${ids.cA1}`);
    expect(student.body.data.description).toBe(BODY);
    expect(student.body.data.statusHistory).toHaveLength(1);
    expect(student.body.data.statusHistory[0]).not.toHaveProperty('actor');
    expect(student.body.data).not.toHaveProperty('submittedBy');

    const staff = await get('officera', `/complaints/${ids.cA1}`);
    expect(staff.body.data.statusHistory[0].actor.fullName).toBe('studenta1');
    expect(staff.body.data.submittedBy.matricNumber).toBe('CMP/1000/001');
    expect(staff.body.data.escalatedToFaculty).toBe(false);
    expect(JSON.stringify(staff.body)).not.toMatch(/passwordHash|email/i);
  });
});
