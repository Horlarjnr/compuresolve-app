import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

// Strict: no status, no inviter id, no token. The server decides all of those.
export const createInvitationSchema = z
  .object({
    email,
    role: z.enum(['OFFICER', 'HOD', 'FACULTY_ADMIN']),
    departmentId: z.string().uuid('Select a valid department').optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.role === 'FACULTY_ADMIN' && v.departmentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['departmentId'],
        message: 'Faculty Admin invitations must not include a department',
      });
    }
    if (v.role !== 'FACULTY_ADMIN' && !v.departmentId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['departmentId'], message: 'Department is required' });
    }
  });

// New staff: token + fullName + the password they choose.
// Existing account: token + the password they already have (fullName is ignored).
export const acceptInvitationSchema = z
  .object({
    token: z.string().min(20).max(200),
    fullName: z.string().trim().min(2, 'Full name is too short').max(100, 'Full name is too long').optional(),
    password: z.string().min(1).max(200),
  })
  .strict();

export const invitationIdParamSchema = z.object({ id: z.string().uuid() }).strict();

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
