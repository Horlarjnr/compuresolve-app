import type { AuthUser } from '../types/express';
import { departmentIdsForRole, isFacultyAdmin } from '../utils/roles';

// The ONLY place that decides who may see a complaint. Deny by default.
//   Student (submitter):  their own complaints.
//   Officer / HOD:        DEPARTMENT-scope complaints of the departments where they hold an ACTIVE role.
//   Faculty Admin:        FACULTY-scope complaints and departmental cases escalated to the faculty,
//                         never every departmental complaint.
// `user` comes from requireAuth, so only ACTIVE memberships and active faculty roles are present.

export type ComplaintAccessFields = {
  submittedById: string;
  scope: string;
  departmentId: string | null;
  escalatedToFaculty: boolean;
};

const staffDepartmentIds = (user: AuthUser) => [
  ...departmentIdsForRole(user, 'OFFICER'),
  ...departmentIdsForRole(user, 'HOD'),
];

// For ONE loaded complaint (detail view, before any write).
export const canViewComplaint = (user: AuthUser, complaint: ComplaintAccessFields): boolean => {
  if (complaint.submittedById === user.id) return true;
  if (complaint.scope === 'DEPARTMENT' && complaint.departmentId) {
    if (staffDepartmentIds(user).includes(complaint.departmentId)) return true;
  }
  if (isFacultyAdmin(user) && (complaint.scope === 'FACULTY' || complaint.escalatedToFaculty)) return true;
  return false;
};

// For LISTS: a Prisma `where` that matches exactly the complaints canViewComplaint allows.
// Always combine it with other filters using AND, never replace it.
export const complaintScopeWhere = (user: AuthUser) => {
  const clauses: object[] = [{ submittedById: user.id }];

  const departmentIds = staffDepartmentIds(user);
  if (departmentIds.length > 0) {
    clauses.push({ scope: 'DEPARTMENT' as const, departmentId: { in: departmentIds } });
  }
  if (isFacultyAdmin(user)) {
    clauses.push({ OR: [{ scope: 'FACULTY' as const }, { escalatedToFaculty: true }] });
  }
  return { OR: clauses };
};
