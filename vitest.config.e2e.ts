import { defineConfig } from 'vitest/config';

const testTimeout = 300_000;

export default defineConfig({
  test: {
    include: ['packages/*/e2e/**/*.test.ts'],
    testTimeout,
  },
});
