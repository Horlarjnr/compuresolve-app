import { defineConfig } from 'vitest/config';

// Database tests: run against the Neon TEST branch only (see tests/integration/db.setup.ts).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/integration/db.setup.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
