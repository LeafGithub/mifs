import { defineConfig } from 'vitest/config';

// e2e/ is Playwright's; vitest runs only the unit tests.
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
