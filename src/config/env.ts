import 'dotenv/config';
import { z } from 'zod';

const originSchema = z
  .string()
  .url('must be a valid URL')
  .refine(
    (v) => {
      try {
        return new URL(v).origin === v;
      } catch {
        return false; // not a parseable URL (e.g. "*"): reported by the .url() check above
      }
    },
    'must be scheme://host[:port] only (no path, no trailing slash)',
  );

// Empty string in .env counts as "not set".
const optionalPostgresUrl = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string().regex(/^postgres(ql)?:\/\/.+/, 'must be a postgres connection string').optional(),
);

// z.enum's default message repeats the bad value; ours never does.
const oneOf = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values, { errorMap: () => ({ message: `must be one of: ${values.join(', ')}` }) });

const optionalString = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());

const envSchema = z
  .object({
    NODE_ENV: oneOf(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    FRONTEND_ORIGINS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
      .pipe(z.array(originSchema)),
    TRUST_PROXY: oneOf(['0', '1']).default('0'),
    // DATABASE_URL = pooled Neon URL used by the running app (required except in tests).
    // DIRECT_URL = direct Neon URL used by Prisma migrations (read by prisma.config.ts).
    DATABASE_URL: optionalPostgresUrl,
    DIRECT_URL: optionalPostgresUrl,
    // Email: "console" prints emails in the terminal (development only); "smtp" sends through Gmail.
    MAIL_MODE: oneOf(['console', 'smtp']).default('console'),
    SMTP_HOST: optionalString,
    SMTP_PORT: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).max(65535).default(465)),
    SMTP_USER: optionalString,
    SMTP_PASS: optionalString,
    MAIL_FROM: optionalString,
  })
  .superRefine((e, ctx) => {
    if (e.NODE_ENV === 'production' && e.FRONTEND_ORIGINS.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['FRONTEND_ORIGINS'], message: 'is required in production' });
    }
    if (e.MAIL_MODE === 'smtp') {
      for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'] as const) {
        if (!e[key]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'is required when MAIL_MODE=smtp' });
      }
    }
    if (e.NODE_ENV === 'production' && e.MAIL_MODE !== 'smtp') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['MAIL_MODE'], message: 'must be smtp in production' });
    }
    if (e.NODE_ENV !== 'test' && !e.DATABASE_URL) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['DATABASE_URL'], message: 'is required' });
    }
  });

// Throws an Error naming the bad variables and why. It never prints their values.
export function parseEnv(source: NodeJS.ProcessEnv) {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration -> ${problems}`);
  }
  const e = result.data;
  return {
    nodeEnv: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    port: e.PORT,
    frontendOrigins: e.FRONTEND_ORIGINS.length > 0 ? e.FRONTEND_ORIGINS : ['http://localhost:3000'],
    trustProxy: e.TRUST_PROXY === '1',
    databaseUrl: e.DATABASE_URL,
    directUrl: e.DIRECT_URL,
    mailMode: e.MAIL_MODE,
    mailFrom: e.MAIL_FROM ?? `CompuResolve <${e.SMTP_USER ?? 'no-reply@localhost'}>`,
    smtp:
      e.MAIL_MODE === 'smtp' && e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASS
        ? { host: e.SMTP_HOST, port: e.SMTP_PORT, user: e.SMTP_USER, pass: e.SMTP_PASS }
        : undefined,
  };
}

function loadEnv(): ReturnType<typeof parseEnv> {
  try {
    return parseEnv(process.env);
  } catch (error) {
    console.error((error as Error).message);
    return process.exit(1) as never;
  }
}

export const env = loadEnv();
