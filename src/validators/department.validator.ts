import { z } from 'zod';

export const createDepartmentSchema = z
  .object({
    name: z.string().trim().min(3, 'Department name is too short').max(120, 'Department name is too long'),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{2,10}$/, 'Code must be 2 to 10 letters or digits'),
  })
  .strict();

export const departmentParamsSchema = z.object({ departmentId: z.string().uuid() }).strict();

export const membershipParamsSchema = z
  .object({ departmentId: z.string().uuid(), membershipId: z.string().uuid() })
  .strict();

export const pageQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
