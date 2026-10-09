import { defineConfig } from 'vitest/config';

// e2e/ belongs to Playwright; vitest only runs unit tests next to the sources.
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
