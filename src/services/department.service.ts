import { prisma } from '../utils/prisma';

// Public list for the registration form. Only active departments, only harmless fields.
export const listActiveDepartments = () =>
  prisma.department.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true },
    orderBy: { name: 'asc' },
  });
