import { defineCommand } from 'citty';
import { run } from '#src/core/process.js';

/**
 * The `gtb task` name of {@link testVitest}, which no leaf runs.
 */
export const testVitestName = 'test:vitest';

/**
 * Runs all source tests via Vitest.
 */
export const testVitest = defineCommand({
  meta: {
    description: 'Run all source tests via Vitest',
    name: testVitestName,
  },
  run: async ({ rawArgs }) => {
    await run('vitest', { args: ['run', ...rawArgs] });
  },
});
