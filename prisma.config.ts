import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts', // run with: npx prisma db seed
  },
  datasource: {
    // Neon: migrations must use the DIRECT (non-pooled) URL. Falls back to DATABASE_URL if DIRECT_URL is unset.
    url: process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'],
  },
});
