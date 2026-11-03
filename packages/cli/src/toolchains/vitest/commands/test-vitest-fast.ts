import { defineCommand } from 'citty';
import { run } from '#src/core/process.js';
import { testVitestFastLeaf } from '#src/toolchains/vitest/leaves.js';
import { blobFile, coverageDir } from '#src/toolchains/vitest/paths.js';

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
        `--outputFile.blob=${blobFile.fast}`,
        `--coverage.reportsDirectory=${coverageDir.fast}`,
        ...rawArgs,
      ],
    });
  },
});
