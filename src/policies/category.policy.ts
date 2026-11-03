import type { AuthUser } from '../types/express';
import { departmentIdsForRole, isFacultyAdmin } from '../utils/roles';

// Faculty Admin manages any category. A HOD manages categories of their OWN department only.
export const canManageCategory = (user: AuthUser, category: { scope: string; departmentId: string | null }) => {
  if (isFacultyAdmin(user)) return true;
  return (
    category.scope === 'DEPARTMENT' &&
    !!category.departmentId &&
    departmentIdsForRole(user, 'HOD').includes(category.departmentId)
  );
};
