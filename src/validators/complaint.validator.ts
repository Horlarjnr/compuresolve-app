import { z } from 'zod';
import { REASON_REQUIRED_STATUSES } from '../policies/complaint-workflow';

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

export const assignComplaintSchema = z.object({ officerId: z.string().uuid('Select a valid officer') }).strict();

export const transitionSchema = z
  .object({
    toStatus: z.enum(STATUSES),
    reason: z.string().trim().min(5, 'Reason is too short').max(2000, 'Reason is too long').optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((REASON_REQUIRED_STATUSES as string[]).includes(v.toStatus) && !v.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'A reason is required for this change. It will be shown to the student.',
      });
    }
  });

export type TransitionInput = z.infer<typeof transitionSchema>;
