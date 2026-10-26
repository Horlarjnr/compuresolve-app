// The ONLY fields we load for a signed-in user. passwordHash is deliberately not here.
export const publicUserSelect = {
  id: true,
  fullName: true,
  email: true,
  matricNumber: true,
  isActive: true,
  emailVerifiedAt: true,
  memberships: {
    where: { status: 'ACTIVE' as const },
    select: { departmentId: true, role: true },
  },
  facultyRoles: {
    where: { isActive: true },
    select: { role: true },
  },
  studentProfile: { select: { level: true } },
};
