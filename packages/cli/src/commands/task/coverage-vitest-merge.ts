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
        ...rawArgs,
      ],
    });
  },
});
