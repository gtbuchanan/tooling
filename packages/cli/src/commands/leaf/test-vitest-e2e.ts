import type { RunCommandDef } from '../types.ts';

/** Runs end-to-end tests via Vitest with the e2e config. */
export const def = {
  args: [
    'run', '--config', 'vitest.config.e2e.ts',
    '--outputFile.blob=dist/test-results/vitest/blob-e2e.json',
  ],
  bin: 'vitest',
  name: 'test:vitest:e2e',
} as const satisfies RunCommandDef;
