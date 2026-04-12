import type { RunCommandDef } from '../types.ts';

/** Merges fast + slow coverage blobs into a unified report. */
export const def = {
  args: [
    '--merge-reports', 'dist/test-results/vitest/merge',
    '--coverage.reportsDirectory=dist/coverage/vitest/merged',
  ],
  bin: 'vitest',
  name: 'coverage:vitest:merge',
} as const satisfies RunCommandDef;
