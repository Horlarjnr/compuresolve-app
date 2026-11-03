import { z } from 'zod';

const STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'AWAITING_STUDENT',
  'IN_PROGRESS',
  'ESCALATED',
  'RESOLVED',
  'CLOSED',
  'REJECTED',
] as const;

// Deliberately small. The client never sends: submittedById, status, priority, assignedToId, scope or reference.
export const createComplaintSchema = z
  .object({
    target: z.enum(['DEPARTMENT', 'FACULTY']).default('DEPARTMENT'),
    departmentId: z.string().uuid('Select a valid department').optional(), // must match the student's own department
    categoryId: z.string().uuid('Select a valid category'),
    title: z.string().trim().min(5, 'Title is too short').max(150, 'Title is too long'),
    description: z.string().trim().min(20, 'Please describe the problem in more detail').max(5000, 'Description is too long'),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.target === 'FACULTY' && v.departmentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['departmentId'],
        message: 'Faculty-level complaints must not include a department',
      });
    }
  });

export const complaintParamsSchema = z.object({ complaintId: z.string().uuid() }).strict();

export const listComplaintsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(STATUSES).optional(),
    departmentId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    assigned: z.enum(['me', 'none']).optional(),
    q: z.string().trim().min(2).max(100).optional(),
  })
  .strict();

export type CreateComplaintInput = z.infer<typeof createComplaintSchema>;
export type ListComplaintsQuery = z.infer<typeof listComplaintsQuerySchema>;
