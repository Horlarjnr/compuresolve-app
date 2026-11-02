import { describe, expect, test } from 'vitest';
import { canViewComplaint, complaintScopeWhere } from '../src/policies/complaint.policy';
import { canManageMembership, canViewDepartmentMembers } from '../src/policies/department.policy';
import type { AuthUser } from '../src/types/express';

const A = 'dept-a';
const B = 'dept-b';

const user = (over: Partial<AuthUser> = {}): AuthUser => ({
  id: 'u1',
  fullName: 'Test User',
  email: 'u1@example.com',
  matricNumber: null,
  isActive: true,
  emailVerifiedAt: new Date(),
  memberships: [],
  facultyRoles: [],
  studentProfile: null,
  ...over,
});

const complaint = (over = {}) => ({
  submittedById: 'someone-else',
  scope: 'DEPARTMENT',
  departmentId: A,
  escalatedToFaculty: false,
  ...over,
});

const student = user({ id: 's1', memberships: [{ departmentId: A, role: 'STUDENT' }] });
const officerA = user({ id: 'o1', memberships: [{ departmentId: A, role: 'OFFICER' }] });
const hodA = user({ id: 'h1', memberships: [{ departmentId: A, role: 'HOD' }] });
const admin = user({ id: 'f1', facultyRoles: [{ role: 'FACULTY_ADMIN' }] });
const nobody = user({ id: 'n1' });

describe('canViewComplaint', () => {
  test('a student sees only their own complaints', () => {
    expect(canViewComplaint(student, complaint({ submittedById: 's1' }))).toBe(true);
    expect(canViewComplaint(student, complaint())).toBe(false);
  });

  test('a student cannot see a colleague complaint in the same department', () => {
    expect(canViewComplaint(student, complaint({ submittedById: 's2', departmentId: A }))).toBe(false);
  });

  test('officers and HODs see their own department only', () => {
    for (const staffUser of [officerA, hodA]) {
      expect(canViewComplaint(staffUser, complaint({ departmentId: A }))).toBe(true);
      expect(canViewComplaint(staffUser, complaint({ departmentId: B }))).toBe(false);
    }
  });

  test('officers and HODs cannot see faculty-level complaints from other people', () => {
    expect(canViewComplaint(officerA, complaint({ scope: 'FACULTY', departmentId: null }))).toBe(false);
    expect(canViewComplaint(hodA, complaint({ scope: 'FACULTY', departmentId: null }))).toBe(false);
  });

  test('the Faculty Admin sees faculty-level and escalated cases, not ordinary departmental ones', () => {
    expect(canViewComplaint(admin, complaint({ scope: 'FACULTY', departmentId: null }))).toBe(true);
    expect(canViewComplaint(admin, complaint({ departmentId: B, escalatedToFaculty: true }))).toBe(true);
    expect(canViewComplaint(admin, complaint({ departmentId: A }))).toBe(false);
    expect(canViewComplaint(admin, complaint({ departmentId: B }))).toBe(false);
  });

  test('a user with no roles sees only complaints they submitted', () => {
    expect(canViewComplaint(nobody, complaint())).toBe(false);
    expect(canViewComplaint(nobody, complaint({ submittedById: 'n1' }))).toBe(true);
  });

  test('a student role in a department gives no staff access to it', () => {
    expect(canViewComplaint(student, complaint({ departmentId: A, submittedById: 'x' }))).toBe(false);
  });
});

describe('complaintScopeWhere', () => {
  test('always starts with the user\'s own complaints and nothing else for a plain user', () => {
    expect(complaintScopeWhere(nobody)).toEqual({ OR: [{ submittedById: 'n1' }] });
    expect(complaintScopeWhere(student)).toEqual({ OR: [{ submittedById: 's1' }] });
  });

  test('staff get their department ids; an HOD/Officer in two departments gets both', () => {
    const two = user({
      id: 'o2',
      memberships: [
        { departmentId: A, role: 'OFFICER' },
        { departmentId: B, role: 'HOD' },
      ],
    });
    const where = complaintScopeWhere(two) as { OR: Record<string, unknown>[] };
    const dept = where.OR.find((c) => c.scope === 'DEPARTMENT') as { departmentId: { in: string[] } };
    expect(dept.departmentId.in.sort()).toEqual([A, B]);
  });

  test('the Faculty Admin clause is limited to faculty scope or escalated cases', () => {
    const where = complaintScopeWhere(admin) as { OR: unknown[] };
    expect(where.OR).toContainEqual({ OR: [{ scope: 'FACULTY' }, { escalatedToFaculty: true }] });
    expect(JSON.stringify(where)).not.toContain('"scope":"DEPARTMENT"');
  });
});

describe('department policy', () => {
  test('only the Faculty Admin or the HOD of that department may list its staff', () => {
    expect(canViewDepartmentMembers(admin, A)).toBe(true);
    expect(canViewDepartmentMembers(hodA, A)).toBe(true);
    expect(canViewDepartmentMembers(hodA, B)).toBe(false);
    expect(canViewDepartmentMembers(officerA, A)).toBe(false);
    expect(canViewDepartmentMembers(student, A)).toBe(false);
  });

  test('membership management: HOD manages own-department Officers only; admin manages staff; nobody manages students', () => {
    expect(canManageMembership(hodA, { departmentId: A, role: 'OFFICER' })).toBe(true);
    expect(canManageMembership(hodA, { departmentId: B, role: 'OFFICER' })).toBe(false);
    expect(canManageMembership(hodA, { departmentId: A, role: 'HOD' })).toBe(false);
    expect(canManageMembership(admin, { departmentId: B, role: 'HOD' })).toBe(true);
    expect(canManageMembership(admin, { departmentId: B, role: 'OFFICER' })).toBe(true);
    expect(canManageMembership(admin, { departmentId: A, role: 'STUDENT' })).toBe(false);
    expect(canManageMembership(officerA, { departmentId: A, role: 'OFFICER' })).toBe(false);
  });
});
