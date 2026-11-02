import type { AuthUser } from '../types/express';
import { departmentIdsForRole, isFacultyAdmin } from '../utils/roles';

// Who may see a department's staff list: Faculty Admin (any department) or a HOD of THAT department.
export const canViewDepartmentMembers = (user: AuthUser, departmentId: string) =>
  isFacultyAdmin(user) || departmentIdsForRole(user, 'HOD').includes(departmentId);

// Who may suspend or reactivate a staff membership:
//   Faculty Admin: any Officer or HOD.   HOD: Officers in their own department only.
//   Student memberships are never managed here.
export const canManageMembership = (actor: AuthUser, membership: { departmentId: string; role: string }) => {
  if (membership.role !== 'OFFICER' && membership.role !== 'HOD') return false;
  if (isFacultyAdmin(actor)) return true;
  return membership.role === 'OFFICER' && departmentIdsForRole(actor, 'HOD').includes(membership.departmentId);
};
