import { z } from 'zod';

// Plain text only. The client never sends sender, complaint id in the body, or timestamps.
export const createMessageSchema = z
  .object({
    body: z.string().trim().min(1, 'Message cannot be empty').max(2000, 'Message is too long (2000 characters maximum)'),
    // Students can only ever send STUDENT_AND_STAFF; staff may also send internal STAFF_ONLY notes.
    visibility: z.enum(['STUDENT_AND_STAFF', 'STAFF_ONLY']).optional(),
  })
  .strict();

export const listMessagesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
