// Run with: npm run db:cleanup   (schedule it daily, e.g. a Render cron job)
import { cleanupExpired } from '../src/services/cleanup.service';
import { prisma } from '../src/utils/prisma';

cleanupExpired()
  .then((removed) => console.log(JSON.stringify({ job: 'db:cleanup', removed })))
  .catch((error) => {
    console.error('Cleanup failed:', error instanceof Error ? error.name : 'unknown error');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
