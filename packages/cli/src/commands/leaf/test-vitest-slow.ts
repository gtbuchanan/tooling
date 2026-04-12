import type { RunCommandDef } from '../types.ts';

/** Runs slow source tests via Vitest (only tests tagged `slow`). */
export const def = {
  args: [
    'run', '--tags-filter=slow', '--pass-with-no-tests',
    '--outputFile.blob=dist/test-results/vitest/merge/blob-slow.json',
    '--coverage.reportsDirectory=dist/coverage/vitest/slow',
  ],
  bin: 'vitest',
  name: 'test:vitest:slow',
} as const satisfies RunCommandDef;
