import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { env } from '../config/env';

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

// The running app uses the pooled Neon URL (DATABASE_URL).
// Generous timeouts: Neon computes can take a few seconds to wake up, and a slow network adds to connection time.
const adapter = new PrismaPg({
  connectionString: env.databaseUrl,
  connectionTimeoutMillis: 30_000,
  idleTimeoutMillis: 30_000,
});
const prisma = new PrismaClient({ adapter });

export { prisma };
