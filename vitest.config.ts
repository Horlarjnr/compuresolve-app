import { defineConfig } from 'vitest/config';

// Fast unit tests: no database needed. Database tests live in tests/integration (npm run test:db).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration/**', 'node_modules/**'],
    setupFiles: ['tests/setup.ts'],
  },
});
