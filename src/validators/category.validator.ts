import { z } from 'zod';

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(2, 'Category name is too short').max(80, 'Category name is too long'),
    scope: z.enum(['DEPARTMENT', 'FACULTY']),
    departmentId: z.string().uuid('Select a valid department').optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.scope === 'FACULTY' && v.departmentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['departmentId'],
        message: 'Faculty categories must not include a department',
      });
    }
    if (v.scope === 'DEPARTMENT' && !v.departmentId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['departmentId'], message: 'Department is required' });
    }
  });

export const categoryParamsSchema = z.object({ categoryId: z.string().uuid() }).strict();

export const listCategoriesQuerySchema = z
  .object({
    departmentId: z.string().uuid().optional(),
    scope: z.enum(['DEPARTMENT', 'FACULTY']).optional(),
    includeInactive: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .strict();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;
