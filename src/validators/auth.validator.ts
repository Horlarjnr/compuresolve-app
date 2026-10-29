import { z } from 'zod';
import type { Level } from '../../generated/prisma/enums';
import { passwordSchema } from '../utils/password';

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

const LEVELS = [100, 200, 300, 400, 500];

// .strict() on every schema: unknown fields (role, status, departmentRole, isActive...) are rejected, never ignored.
export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Full name is too short').max(100, 'Full name is too long'),
    email,
    password: passwordSchema,
    matricNumber: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}\/\d{4}\/\d{3}$/, 'Matric number must look like ABC/1234/567'),
    departmentId: z.string().uuid('Select a valid department'),
    level: z.coerce
      .number()
      .int()
      .refine((n) => LEVELS.includes(n), 'Level must be 100, 200, 300, 400 or 500')
      .transform((n) => `L${n}` as Level),
  })
  .strict();

export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) }).strict();

export const resendVerificationSchema = z.object({ email }).strict();

export const loginSchema = z.object({ email, password: z.string().min(1).max(200) }).strict();

export type RegisterInput = z.infer<typeof registerSchema>;
