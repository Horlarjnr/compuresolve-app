import { createError } from '../common/errors/app-error';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import type { CreateDepartmentInput } from '../validators/department.validator';
import { recordAudit } from './audit.service';

const departmentSelect = { id: true, name: true, code: true, isActive: true };

// Public list for the registration form. Only active departments, only harmless fields.
export const listActiveDepartments = () =>
  prisma.department.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true },
    orderBy: { name: 'asc' },
  });

// Faculty Admin view: every department, including inactive ones.
export const listAllDepartments = () =>
  prisma.department.findMany({ select: departmentSelect, orderBy: { name: 'asc' } });

export const createDepartment = async (actor: AuthUser, input: CreateDepartmentInput) => {
  const clash = await prisma.department.findFirst({
    where: { OR: [{ name: { equals: input.name, mode: 'insensitive' } }, { code: input.code }] },
    select: { name: true },
  });
  if (clash) {
    const sameName = clash.name.toLowerCase() === input.name.toLowerCase();
    throw createError(
      409,
      sameName ? 'A department with this name already exists' : 'A department with this code already exists',
      'CONFLICT',
    );
  }

  const department = await prisma.department.create({ data: input, select: departmentSelect });
  await recordAudit({
    actorId: actor.id,
    departmentId: department.id,
    action: 'department.created',
    entityType: 'Department',
    entityId: department.id,
    metadata: { code: department.code },
  });
  return department;
};

export const setDepartmentActive = async (actor: AuthUser, departmentId: string, isActive: boolean) => {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, isActive: true },
  });
  if (!department) throw createError(404, 'Department not found');
  if (department.isActive === isActive) {
    throw createError(409, isActive ? 'Department is already active' : 'Department is already inactive', 'NO_CHANGE');
  }

  const updated = await prisma.department.update({
    where: { id: departmentId },
    data: { isActive },
    select: departmentSelect,
  });
  await recordAudit({
    actorId: actor.id,
    departmentId,
    action: isActive ? 'department.reactivated' : 'department.deactivated',
    entityType: 'Department',
    entityId: departmentId,
  });
  return updated;
};
