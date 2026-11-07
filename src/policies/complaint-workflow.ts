import type { AuthUser } from '../types/express';
import { departmentIdsForRole, isFacultyAdmin } from '../utils/roles';

// The complaint state machine and WHO may drive it. One file, easy to review with your supervisor.

export type ComplaintStatusName =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'AWAITING_STUDENT'
  | 'IN_PROGRESS'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REJECTED';

export type ActorRole = 'HOD' | 'OFFICER' | 'FACULTY_ADMIN';

// Statuses in which a complaint can still be assigned or escalated.
export const OPEN_STATUSES: ComplaintStatusName[] = ['SUBMITTED', 'UNDER_REVIEW', 'AWAITING_STUDENT', 'IN_PROGRESS'];

// A reason (shown to the student) is mandatory for these moves.
export const REASON_REQUIRED_STATUSES: ComplaintStatusName[] = ['REJECTED', 'ESCALATED', 'RESOLVED', 'AWAITING_STUDENT'];

// Every move the system knows about, before looking at who is asking.
const NEXT: Record<ComplaintStatusName, ComplaintStatusName[]> = {
  SUBMITTED: ['UNDER_REVIEW', 'REJECTED', 'ESCALATED'],
  UNDER_REVIEW: ['IN_PROGRESS', 'AWAITING_STUDENT', 'RESOLVED', 'ESCALATED'],
  IN_PROGRESS: ['UNDER_REVIEW', 'AWAITING_STUDENT', 'RESOLVED', 'ESCALATED'],
  AWAITING_STUDENT: ['UNDER_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'ESCALATED'],
  ESCALATED: ['UNDER_REVIEW', 'IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['CLOSED'],
  CLOSED: [], // reopening is a separate, decided request (never a plain status change)
  REJECTED: [],
};

export type WorkflowComplaint = {
  scope: string;
  departmentId: string | null;
  escalatedToFaculty: boolean;
  status: string;
  assignedToId: string | null;
};

// In what capacity may this user work on this complaint?
//   Faculty-level or escalated: only the Faculty Admin (department staff become read-only).
//   Otherwise: the HOD of its department, or an Officer of its department.
export const getActorRole = (user: AuthUser, c: WorkflowComplaint): ActorRole | null => {
  if (c.escalatedToFaculty || c.scope === 'FACULTY') return isFacultyAdmin(user) ? 'FACULTY_ADMIN' : null;
  if (!c.departmentId) return null;
  if (departmentIdsForRole(user, 'HOD').includes(c.departmentId)) return 'HOD';
  if (departmentIdsForRole(user, 'OFFICER').includes(c.departmentId)) return 'OFFICER';
  return null;
};

// Is this move defined for the complaint's current status at all?
export const isTransitionDefined = (c: WorkflowComplaint, to: ComplaintStatusName) =>
  (NEXT[c.status as ComplaintStatusName] ?? []).includes(to);

// The moves a given capacity may make from the current status.
export const targetsFor = (c: WorkflowComplaint, role: ActorRole): ComplaintStatusName[] =>
  (NEXT[c.status as ComplaintStatusName] ?? []).filter((to) => {
    if (role === 'OFFICER') return to !== 'REJECTED' && to !== 'ESCALATED'; // only the HOD rejects or escalates
    if (role === 'FACULTY_ADMIN') {
      if (to === 'ESCALATED') return false; // nothing above the Faculty Admin to escalate to
      if (to === 'REJECTED') return c.scope === 'FACULTY' && !c.escalatedToFaculty; // faculty-level complaints have no HOD
      return true;
    }
    return true; // HOD
  });

// What the signed-in user can do right now (shown to staff so the interface only offers valid buttons).
export const allowedTransitionsFor = (user: AuthUser, c: WorkflowComplaint): ComplaintStatusName[] => {
  const role = getActorRole(user, c);
  if (!role) return [];
  if (role === 'OFFICER' && c.assignedToId !== user.id) return []; // claim it first
  return targetsFor(c, role);
};

// Statuses from which a student may ASK for a reopen. A request never reopens anything by itself.
export const REOPENABLE_STATUSES: ComplaintStatusName[] = ['RESOLVED', 'CLOSED', 'REJECTED'];

// Who may decide a reopen request: the same people who may work the complaint.
// HOD: any in their department. Officer: only when assigned to it. Faculty Admin: faculty-level and escalated cases.
export const canDecideReopen = (user: AuthUser, c: WorkflowComplaint): boolean => {
  const role = getActorRole(user, c);
  if (!role) return false;
  if (role === 'OFFICER') return c.assignedToId === user.id;
  return true;
};

// While a complaint is still being handled the student may write to staff. Once it is resolved, closed or
// rejected the route back is a reopen request, not a message.
export const STUDENT_MESSAGING_STATUSES: ComplaintStatusName[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'AWAITING_STUDENT',
  'IN_PROGRESS',
  'ESCALATED',
];
