import { defineCommand } from 'citty';
import { run } from '../../lib/process.ts';

/** Merges fast + slow coverage blobs into a unified report. */
export const coverageVitestMerge = defineCommand({
  meta: {
    description: 'Merge fast + slow coverage blobs into a unified report',
    name: 'coverage:vitest:merge',
  },
  run: async ({ rawArgs }) => {
    await run('vitest', {
      args: [
        '--merge-reports', 'dist/test-results/vitest/merge',
        '--coverage.reportsDirectory=dist/coverage/vitest/merged',
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
