import { describe, expect, test } from 'vitest';
import {
  allowedTransitionsFor,
  canDecideReopen,
  getActorRole,
  isTransitionDefined,
  REOPENABLE_STATUSES,
  targetsFor,
  type ComplaintStatusName,
} from '../src/policies/complaint-workflow';
import type { AuthUser } from '../src/types/express';

const A = 'dept-a';
const B = 'dept-b';

const user = (over: Partial<AuthUser> = {}): AuthUser => ({
  id: 'u1',
  fullName: 'Test',
  email: 'u1@example.com',
  matricNumber: null,
  isActive: true,
  emailVerifiedAt: new Date(),
  memberships: [],
  facultyRoles: [],
  studentProfile: null,
  ...over,
});

const hodA = user({ id: 'h1', memberships: [{ departmentId: A, role: 'HOD' }] });
const officerA = user({ id: 'o1', memberships: [{ departmentId: A, role: 'OFFICER' }] });
const officerB = user({ id: 'o2', memberships: [{ departmentId: B, role: 'OFFICER' }] });
const admin = user({ id: 'f1', facultyRoles: [{ role: 'FACULTY_ADMIN' }] });
const student = user({ id: 's1', memberships: [{ departmentId: A, role: 'STUDENT' }] });

const c = (over = {}) => ({
  scope: 'DEPARTMENT',
  departmentId: A,
  escalatedToFaculty: false,
  status: 'SUBMITTED',
  assignedToId: null as string | null,
  ...over,
});

describe('getActorRole', () => {
  test('department staff act on their own department only', () => {
    expect(getActorRole(hodA, c())).toBe('HOD');
    expect(getActorRole(officerA, c())).toBe('OFFICER');
    expect(getActorRole(officerB, c())).toBeNull();
    expect(getActorRole(student, c())).toBeNull();
  });

  test('the Faculty Admin does not act on ordinary departmental complaints', () => {
    expect(getActorRole(admin, c())).toBeNull();
  });

  test('escalated complaints belong to the Faculty Admin; department staff become read-only', () => {
    const escalated = c({ escalatedToFaculty: true, status: 'ESCALATED' });
    expect(getActorRole(admin, escalated)).toBe('FACULTY_ADMIN');
    expect(getActorRole(hodA, escalated)).toBeNull();
    expect(getActorRole(officerA, escalated)).toBeNull();
  });

  test('faculty-level complaints belong to the Faculty Admin', () => {
    const faculty = c({ scope: 'FACULTY', departmentId: null });
    expect(getActorRole(admin, faculty)).toBe('FACULTY_ADMIN');
    expect(getActorRole(hodA, faculty)).toBeNull();
  });
});

describe('who can make which move', () => {
  test('from SUBMITTED: the HOD can review, reject or escalate; an Officer can only review', () => {
    expect(targetsFor(c(), 'HOD')).toEqual(['UNDER_REVIEW', 'REJECTED', 'ESCALATED']);
    expect(targetsFor(c(), 'OFFICER')).toEqual(['UNDER_REVIEW']);
  });

  test('an Officer must be assigned before they can do anything', () => {
    expect(allowedTransitionsFor(officerA, c({ assignedToId: null }))).toEqual([]);
    expect(allowedTransitionsFor(officerA, c({ assignedToId: 'someone-else' }))).toEqual([]);
    expect(allowedTransitionsFor(officerA, c({ assignedToId: 'o1' }))).toEqual(['UNDER_REVIEW']);
  });

  test('the HOD needs no assignment', () => {
    expect(allowedTransitionsFor(hodA, c({ assignedToId: null }))).toContain('UNDER_REVIEW');
  });

  test('working states move among each other and can be resolved or escalated (HOD only)', () => {
    const working = c({ status: 'UNDER_REVIEW' });
    expect(targetsFor(working, 'HOD')).toEqual(['IN_PROGRESS', 'AWAITING_STUDENT', 'RESOLVED', 'ESCALATED']);
    expect(targetsFor(working, 'OFFICER')).toEqual(['IN_PROGRESS', 'AWAITING_STUDENT', 'RESOLVED']);
  });

  test('RESOLVED can only be closed; CLOSED and REJECTED are final', () => {
    expect(targetsFor(c({ status: 'RESOLVED' }), 'HOD')).toEqual(['CLOSED']);
    for (const status of ['CLOSED', 'REJECTED']) {
      expect(targetsFor(c({ status }), 'HOD')).toEqual([]);
      expect(targetsFor(c({ status }), 'FACULTY_ADMIN')).toEqual([]);
    }
  });

  test('nothing jumps straight from SUBMITTED to resolved, closed or in progress', () => {
    for (const to of ['RESOLVED', 'CLOSED', 'IN_PROGRESS', 'AWAITING_STUDENT'] as ComplaintStatusName[]) {
      expect(isTransitionDefined(c(), to)).toBe(false);
    }
  });

  test('the Faculty Admin works an escalated case but can never escalate or reject it', () => {
    const escalated = c({ escalatedToFaculty: true, status: 'ESCALATED' });
    expect(targetsFor(escalated, 'FACULTY_ADMIN')).toEqual(['UNDER_REVIEW', 'IN_PROGRESS', 'RESOLVED']);
    const working = c({ escalatedToFaculty: true, status: 'UNDER_REVIEW' });
    expect(targetsFor(working, 'FACULTY_ADMIN')).not.toContain('ESCALATED');
    expect(targetsFor(working, 'FACULTY_ADMIN')).not.toContain('REJECTED');
  });

  test('the Faculty Admin may reject a new faculty-level complaint (it has no HOD)', () => {
    const faculty = c({ scope: 'FACULTY', departmentId: null });
    expect(targetsFor(faculty, 'FACULTY_ADMIN')).toEqual(['UNDER_REVIEW', 'REJECTED']);
  });
});

describe('reopening', () => {
  test('only resolved, closed or rejected complaints can be reopened', () => {
    expect([...REOPENABLE_STATUSES].sort()).toEqual(['CLOSED', 'REJECTED', 'RESOLVED']);
  });

  test('a reopen is never an ordinary status change', () => {
    expect(isTransitionDefined(c({ status: 'CLOSED' }), 'UNDER_REVIEW')).toBe(false);
    expect(isTransitionDefined(c({ status: 'REJECTED' }), 'UNDER_REVIEW')).toBe(false);
    expect(isTransitionDefined(c({ status: 'RESOLVED' }), 'UNDER_REVIEW')).toBe(false);
  });

  test('who may decide: the HOD, the ASSIGNED Officer, and the Faculty Admin for faculty-level or escalated cases', () => {
    const resolved = c({ status: 'RESOLVED', assignedToId: 'o1' });
    expect(canDecideReopen(hodA, resolved)).toBe(true);
    expect(canDecideReopen(officerA, resolved)).toBe(true);
    expect(canDecideReopen(officerA, c({ status: 'RESOLVED', assignedToId: 'someone-else' }))).toBe(false);
    expect(canDecideReopen(officerA, c({ status: 'RESOLVED', assignedToId: null }))).toBe(false);
    expect(canDecideReopen(officerB, resolved)).toBe(false);
    expect(canDecideReopen(student, resolved)).toBe(false);
    expect(canDecideReopen(admin, resolved)).toBe(false); // ordinary departmental complaint
  });

  test('after escalation only the Faculty Admin decides', () => {
    const escalated = c({ status: 'RESOLVED', escalatedToFaculty: true });
    expect(canDecideReopen(admin, escalated)).toBe(true);
    expect(canDecideReopen(hodA, escalated)).toBe(false);
    expect(canDecideReopen(officerA, { ...escalated, assignedToId: 'o1' })).toBe(false);
  });

  test('faculty-level complaints are decided by the Faculty Admin', () => {
    const faculty = c({ scope: 'FACULTY', departmentId: null, status: 'CLOSED' });
    expect(canDecideReopen(admin, faculty)).toBe(true);
    expect(canDecideReopen(hodA, faculty)).toBe(false);
  });
});
