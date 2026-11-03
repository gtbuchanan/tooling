import { defineCommand } from 'citty';
import { run } from '#src/core/process.js';
import { testVitestSlowLeaf } from '#src/toolchains/vitest/leaves.js';
import { blobFile, coverageDir } from '#src/toolchains/vitest/paths.js';

/**
 * Runs slow source tests via Vitest (only tests tagged `slow`).
 */
export const testVitestSlow = defineCommand({
  meta: {
    description: 'Run slow source tests via Vitest (only `slow` tag)',
    name: testVitestSlowLeaf.name,
  },
  run: async ({ rawArgs }) => {
    await run('vitest', {
      args: [
        'run', '--tags-filter=slow', '--pass-with-no-tests',
        `--outputFile.blob=${blobFile.slow}`,
        `--coverage.reportsDirectory=${coverageDir.slow}`,
        ...rawArgs,
      ],
    });
  },
});
