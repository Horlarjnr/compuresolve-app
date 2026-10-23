import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { env } from '../config/env';

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

// The running app uses the pooled Neon URL (DATABASE_URL).
const adapter = new PrismaPg({ connectionString: env.databaseUrl });
const prisma = new PrismaClient({ adapter });

export { prisma };
