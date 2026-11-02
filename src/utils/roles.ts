import type { AuthUser } from '../types/express';

export type AppRole = 'STUDENT' | 'OFFICER' | 'HOD' | 'FACULTY_ADMIN';

// Roles come from the database (active department memberships + active faculty roles), never from the client.
export const getUserRoles = (user: AuthUser): Set<string> =>
  new Set([...user.memberships.map((m) => m.role), ...user.facultyRoles.map((f) => f.role)]);

export const hasAnyRole = (user: AuthUser, roles: readonly string[]) => {
  const owned = getUserRoles(user);
  return roles.some((r) => owned.has(r));
};

// Department ids where the user holds a given role (used for department-level authorization).
export const departmentIdsForRole = (user: AuthUser, role: string) =>
  user.memberships.filter((m) => m.role === role).map((m) => m.departmentId);

export const isFacultyAdmin = (user: AuthUser) => user.facultyRoles.some((f) => f.role === 'FACULTY_ADMIN');
