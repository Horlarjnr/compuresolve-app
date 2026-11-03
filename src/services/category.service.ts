import { createError } from '../common/errors/app-error';
import { canManageCategory } from '../policies/category.policy';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { isFacultyAdmin } from '../utils/roles';
import type { CreateCategoryInput, ListCategoriesQuery } from '../validators/category.validator';
import { recordAudit } from './audit.service';

const categorySelect = { id: true, name: true, scope: true, departmentId: true, isActive: true };

// Categories you can see: faculty-level ones, plus those of departments where you hold any active role.
// The Faculty Admin sees all. Inactive ones are shown only to people who can manage them.
export const listCategories = async (user: AuthUser, query: ListCategoriesQuery) => {
  const departmentIds = Array.from(new Set(user.memberships.map((m) => m.departmentId)));
  const visible = isFacultyAdmin(user)
    ? {}
    : { OR: [{ scope: 'FACULTY' as const }, { scope: 'DEPARTMENT' as const, departmentId: { in: departmentIds } }] };

  const filters: object[] = [visible];
  if (query.departmentId) filters.push({ departmentId: query.departmentId });
  if (query.scope) filters.push({ scope: query.scope });

  const rows = await prisma.complaintCategory.findMany({
    where: { AND: filters },
    select: categorySelect,
    orderBy: [{ scope: 'asc' }, { name: 'asc' }],
  });
  return rows.filter((c) => c.isActive || (query.includeInactive && canManageCategory(user, c)));
};

export const createCategory = async (actor: AuthUser, input: CreateCategoryInput) => {
  const target = { scope: input.scope, departmentId: input.scope === 'DEPARTMENT' ? input.departmentId! : null };
  if (!canManageCategory(actor, target)) throw createError(403, 'You are not allowed to create this category');

  if (target.departmentId) {
    const department = await prisma.department.findFirst({
      where: { id: target.departmentId, isActive: true },
      select: { id: true },
    });
    if (!department) throw createError(400, 'Selected department is not available', 'INVALID_DEPARTMENT');
  }

  const duplicate = await prisma.complaintCategory.findFirst({
    where: { name: { equals: input.name, mode: 'insensitive' }, scope: target.scope, departmentId: target.departmentId },
    select: { id: true },
  });
  if (duplicate) throw createError(409, 'A category with this name already exists here', 'CONFLICT');

  const category = await prisma.complaintCategory.create({
    data: { name: input.name, ...target },
    select: categorySelect,
  });
  await recordAudit({
    actorId: actor.id,
    departmentId: target.departmentId,
    action: 'category.created',
    entityType: 'ComplaintCategory',
    entityId: category.id,
  });
  return category;
};

export const setCategoryActive = async (actor: AuthUser, categoryId: string, isActive: boolean) => {
  const category = await prisma.complaintCategory.findUnique({
    where: { id: categoryId },
    select: categorySelect,
  });
  // Out-of-scope categories look exactly like missing ones.
  if (!category || !canManageCategory(actor, category)) throw createError(404, 'Category not found');
  if (category.isActive === isActive) {
    throw createError(409, isActive ? 'Category is already active' : 'Category is already inactive', 'NO_CHANGE');
  }

  const updated = await prisma.complaintCategory.update({
    where: { id: categoryId },
    data: { isActive },
    select: categorySelect,
  });
  await recordAudit({
    actorId: actor.id,
    departmentId: category.departmentId,
    action: isActive ? 'category.reactivated' : 'category.deactivated',
    entityType: 'ComplaintCategory',
    entityId: categoryId,
  });
  return updated;
};
