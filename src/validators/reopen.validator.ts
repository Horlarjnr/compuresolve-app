import { z } from 'zod';

export const createReopenSchema = z
  .object({ reason: z.string().trim().min(10, 'Please explain why this should be reopened').max(2000, 'Reason is too long') })
  .strict();

export const reopenParamsSchema = z.object({ requestId: z.string().uuid() }).strict();

// A rejection must explain itself: the student reads this note.
export const reopenDecisionSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    note: z.string().trim().min(5, 'Note is too short').max(2000, 'Note is too long').optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.decision === 'REJECT' && !v.note) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'A note is required when rejecting. It will be shown to the student.',
      });
    }
  });

export const listReopenQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  })
  .strict();

export type ReopenDecisionInput = z.infer<typeof reopenDecisionSchema>;
export type ListReopenQuery = z.infer<typeof listReopenQuerySchema>;
