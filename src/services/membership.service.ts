import { createError } from '../common/errors/app-error';
import { canManageMembership, canViewDepartmentMembers } from '../policies/department.policy';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { recordAudit } from './audit.service';

// Staff only (Officers and HODs). Students are deliberately not listed: nobody here needs the student roster.
export const listDepartmentStaff = async (actor: AuthUser, departmentId: string, page: number, limit: number) => {
  // A department you may not see looks exactly like one that does not exist.
  if (!canViewDepartmentMembers(actor, departmentId)) throw createError(404, 'Department not found');
  const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });
  if (!department) throw createError(404, 'Department not found');

  const where = { departmentId, role: { in: ['OFFICER', 'HOD'] as ('OFFICER' | 'HOD')[] } };
  const [total, rows] = await prisma.$transaction([
    prisma.departmentMembership.count({ where }),
    prisma.departmentMembership.findMany({
      where,
      select: {
        id: true,
        role: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return { items: rows, meta: { page, limit, total } };
};

// Loads the membership scoped by BOTH ids in the URL, then checks the actor's authority over it.
const loadManageable = async (actor: AuthUser, departmentId: string, membershipId: string) => {
  const membership = await prisma.departmentMembership.findFirst({
    where: { id: membershipId, departmentId },
    select: { id: true, userId: true, departmentId: true, role: true, status: true },
  });
  if (!membership || !canManageMembership(actor, membership)) throw createError(404, 'Membership not found');
  if (membership.userId === actor.id) {
    throw createError(400, 'You cannot change your own membership', 'SELF_ACTION');
  }
  return membership;
};

export const suspendMembership = async (actor: AuthUser, departmentId: string, membershipId: string) => {
  const membership = await loadManageable(actor, departmentId, membershipId);
  if (membership.status === 'SUSPENDED') {
    throw createError(409, 'Membership is already suspended', 'NO_CHANGE');
  }

  // Takes effect immediately: requireAuth reloads active memberships on every request.
  return prisma.$transaction(async (tx) => {
    const updated = await tx.departmentMembership.update({
      where: { id: membership.id },
      data: { status: 'SUSPENDED' },
      select: { id: true, departmentId: true, role: true, status: true },
    });
    await recordAudit(
      {
        actorId: actor.id,
        departmentId,
        action: 'membership.suspended',
        entityType: 'DepartmentMembership',
        entityId: membership.id,
        metadata: { role: membership.role },
      },
      tx,
    );
    return updated;
  });
};

export const reactivateMembership = async (actor: AuthUser, departmentId: string, membershipId: string) => {
  const membership = await loadManageable(actor, departmentId, membershipId);
  if (membership.status !== 'SUSPENDED') {
    throw createError(409, 'Only a suspended membership can be reactivated', 'NO_CHANGE');
  }

  return prisma.$transaction(async (tx) => {
    if (membership.role === 'HOD') {
      // One active HOD per department (a unique database index also guards against a simultaneous change).
      const other = await tx.departmentMembership.findFirst({
        where: { departmentId, role: 'HOD', status: 'ACTIVE', id: { not: membership.id } },
        select: { id: true },
      });
      if (other) throw createError(409, 'This department already has an active Head of Department', 'HOD_EXISTS');
    }
    const updated = await tx.departmentMembership.update({
      where: { id: membership.id },
      data: { status: 'ACTIVE' },
      select: { id: true, departmentId: true, role: true, status: true },
    });
    await recordAudit(
      {
        actorId: actor.id,
        departmentId,
        action: 'membership.reactivated',
        entityType: 'DepartmentMembership',
        entityId: membership.id,
        metadata: { role: membership.role },
      },
      tx,
    );
    return updated;
  });
};
