import { defineCommand } from 'citty';
import { run } from '#src/core/process.js';
import { coverageVitestMergeLeaf } from '#src/toolchains/vitest/leaves.js';
import { coverageDir, mergeBlobDir } from '#src/toolchains/vitest/paths.js';

/**
 * Merges fast + slow coverage blobs into a unified report.
 */
export const coverageVitestMerge = defineCommand({
  meta: {
    description: 'Merge fast + slow coverage blobs into a unified report',
    name: coverageVitestMergeLeaf.name,
  },
  run: async ({ rawArgs }) => {
    await run('vitest', {
      args: [
        '--merge-reports', mergeBlobDir,
        `--coverage.reportsDirectory=${coverageDir.merged}`,
        /*
         * Replace the config's reporters for this run: vitest 4 refuses to
         * merge while `blob` (needed by the fast/slow runs to produce the
         * blobs) is an active reporter.
         */
        '--reporter=default',
        ...rawArgs,
      ],
    });
  },
});
