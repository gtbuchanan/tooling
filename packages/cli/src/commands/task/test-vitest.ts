import { defineCommand } from 'citty';
import { run } from '../../lib/process.ts';

/** Runs all source tests via Vitest. */
export const testVitest = defineCommand({
  meta: {
    description: 'Run all source tests via Vitest',
    name: 'test:vitest',
  },
  run: async ({ rawArgs }) => {
    await run('vitest', { args: ['run', ...rawArgs] });
  },
});
