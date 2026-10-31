import { defineCommand } from 'citty';
import { run } from '#src/core/process.js';
import { testVitestFastLeaf } from '#src/toolchains/vitest/leaves.js';

/**
 * Runs fast source tests via Vitest (excludes tests tagged `slow`).
 */
export const testVitestFast = defineCommand({
  meta: {
    description: 'Run fast source tests via Vitest (excludes `slow` tag)',
    name: testVitestFastLeaf.name,
  },
  run: async ({ rawArgs }) => {
    await run('vitest', {
      args: [
        'run', '--tags-filter=!slow',
        '--outputFile.blob=dist/test-results/vitest/merge/blob-fast.json',
        '--coverage.reportsDirectory=dist/coverage/vitest/fast',
        ...rawArgs,
      ],
    });
  },
});
