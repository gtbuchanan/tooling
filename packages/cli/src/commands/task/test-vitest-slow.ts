import { defineCommand } from 'citty';
import { run } from '../../lib/process.ts';

/** Runs slow source tests via Vitest (only tests tagged `slow`). */
export const testVitestSlow = defineCommand({
  meta: {
    description: 'Run slow source tests via Vitest (only `slow` tag)',
    name: 'test:vitest:slow',
  },
  run: async ({ rawArgs }) => {
    await run('vitest', {
      args: [
        'run', '--tags-filter=slow', '--pass-with-no-tests',
        '--outputFile.blob=dist/test-results/vitest/merge/blob-slow.json',
        '--coverage.reportsDirectory=dist/coverage/vitest/slow',
        ...rawArgs,
      ],
    });
  },
});
