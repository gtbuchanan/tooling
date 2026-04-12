import type { RunCommandDef } from '../types.ts';

/** Runs fast source tests via Vitest (excludes tests tagged `slow`). */
export const def = {
  args: [
    'run', '--tags-filter=!slow',
    '--outputFile.blob=dist/test-results/vitest/merge/blob-fast.json',
    '--coverage.reportsDirectory=dist/coverage/vitest/fast',
  ],
  bin: 'vitest',
  name: 'test:vitest:fast',
} as const satisfies RunCommandDef;
